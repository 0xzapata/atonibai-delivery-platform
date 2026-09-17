import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import { Pool } from 'pg';
import { Server as SocketIOServer } from 'socket.io';
import { z } from 'zod';
import net from 'node:net';

// ---------------------------------------------------------------------------
// KaonCDO food-delivery POC API (t3-api)
// Raw pg + zod. Single-file server for POC simplicity.
// Redis is optional: best-effort only, API fully works without it.
// ---------------------------------------------------------------------------

type Persona = 'buyer' | 'store_owner' | 'rider' | 'operator' | 'support';
const PERSONAS: Persona[] = ['buyer', 'store_owner', 'rider', 'operator', 'support'];

declare module 'fastify' {
  interface FastifyRequest {
    persona?: Persona;
  }
}

const app = Fastify({ logger: true });
// POC allowlist: demo clients run on localhost. Refuse any other browser
// origin production-side (see issue #13); same-origin dev-proxy traffic is
// unaffected. Socket.IO registration below uses the same list.
const ALLOWED_ORIGINS = [/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
await app.register(cors, { origin: ALLOWED_ORIGINS });

// Same default JSON behavior, but an empty body with `Content-Type: application/json`
// is treated as "no body" instead of a 400 (some HTTP clients send the header always).
// Same as the default JSON parser, but an empty body sent with
// `Content-Type: application/json` means "no body" instead of a 400.
app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
  try {
    if (body === '' || body === undefined || body === null) return done(null, undefined);
    done(null, JSON.parse(body as string));
  } catch (e) {
    done(e as Error);
  }
});
// Tolerate clients (e.g. PowerShell Invoke-RestMethod) that POST with an empty
// `application/x-www-form-urlencoded` body: treat empty as no body instead of 415.
app.addContentTypeParser(
  'application/x-www-form-urlencoded',
  { parseAs: 'string' },
  (req, body, done) => {
    try {
      if (!body) return done(null, undefined);
      done(null, Object.fromEntries(new URLSearchParams(body as string)));
    } catch (e) {
      done(e as Error);
    }
  },
);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://kaon:kaonpw@localhost:5432/kaoncdo',
});

// In-memory idempotency store: Idempotency-Key -> orderId (POC only).
const idempotency = new Map<string, string>();

let io: SocketIOServer | undefined;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requirePersona(req: FastifyRequest, reply: FastifyReply, allowed: Persona[]): boolean {
  if (!req.persona || !allowed.includes(req.persona)) {
    reply.code(403).send({ error: 'forbidden', need: allowed, have: req.persona ?? null });
    return false;
  }
  return true;
}

const uuidParam = z.string().uuid();

function badId(reply: FastifyReply, what = 'id'): boolean {
  reply.code(400).send({ error: 'invalid_id', what });
  return false;
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const a =
    s1 * s1 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * s2 * s2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** 39 base + 8/km store->buyer, min 39. Whole pesos. */
function deliveryFeeForKm(km: number): number {
  return Math.max(39, Math.round(39 + 8 * km));
}

async function appendTimeline(orderId: string, status: string, note?: string): Promise<void> {
  const entry: Record<string, string> = { at: new Date().toISOString(), status };
  if (note) entry.note = note;
  await pool.query('UPDATE orders SET timeline = timeline || $2::jsonb, updated_at = now() WHERE id = $1', [
    orderId,
    JSON.stringify(entry),
  ]);
}

async function setOrderStatus(orderId: string, status: string, note?: string): Promise<void> {
  await pool.query('UPDATE orders SET status = $2, updated_at = now() WHERE id = $1', [orderId, status]);
  await appendTimeline(orderId, status, note);
}

// --- socket emits (rooms ONLY — never io.emit globally, which would leak
// every order's live GPS + tickets to all connected clients; see issue #2) ---
function emitOrderUpdated(orderId: string, status: string): void {
  if (!io) return;
  const payload = { orderId, status };
  io.to(`order:${orderId}`).emit('order.updated', payload);
  io.to('city.ops').emit('order.updated', payload);
}

function emitOfferCreated(offer: unknown, orderId: string): void {
  if (!io) return;
  io.to(`order:${orderId}`).emit('offer.created', offer);
  io.to('city.ops').emit('offer.created', offer);
}

function emitTrackingPoint(orderId: string, lat: number, lng: number, heading: number | null): void {
  if (!io) return;
  const payload = { orderId, lat, lng, heading };
  io.to(`order:${orderId}`).emit('tracking.point', payload);
  io.to('city.ops').emit('tracking.point', payload);
}

function emitTicketUpdated(ticket: unknown): void {
  if (!io) return;
  // No per-ticket room exists; staff listeners join city.ops. Never global.
  io.to('city.ops').emit('ticket.updated', ticket);
}

function emitOpsBroadcast(message: string): void {
  if (!io) return;
  const payload = { message, at: new Date().toISOString() };
  io.to('city.ops').emit('ops.broadcast', payload);
}

// --- redis: lazy / best-effort only -------------------------------------------
async function maybeInitRedis(): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) {
    app.log.info('REDIS_URL not set — running without Redis (in-memory idempotency)');
    return;
  }
  const m = /^redis:\/\/([^:/]+)(?::(\d+))?/.exec(url);
  if (!m) {
    app.log.warn('REDIS_URL unparseable — skipping Redis');
    return;
  }
  const host = m[1] as string;
  const port = Number(m[2] ?? 6379);
  await new Promise<void>((resolve) => {
    const sock = net.connect({ host, port });
    const done = (ok: boolean) => {
      try {
        sock.destroy();
      } catch {
        /* noop */
      }
      app.log.info(ok ? 'Redis reachable (unused in POC paths)' : 'Redis unreachable — continuing without it');
      resolve();
    };
    const t = setTimeout(() => done(false), 1500);
    sock.on('connect', () => {
      clearTimeout(t);
      done(true);
    });
    sock.on('error', () => {
      clearTimeout(t);
      done(false);
    });
  });
}

// ---------------------------------------------------------------------------
// Dispatch: offer nearest online rider, 25s expiry + re-offer loop
// ---------------------------------------------------------------------------

const DISPATCHABLE = ['placed', 'store_accepted', 'preparing', 'ready'];

async function dispatchOrder(orderId: string): Promise<void> {
  try {
    // #12 (partial): retire time-expired 'offered' rows up front. In-memory
    // expiry timers die with the process; without this the rows linger.
    await pool.query(
      `UPDATE offers SET status = 'expired'
       WHERE order_id = $1 AND status = 'offered'
         AND expires_at IS NOT NULL AND expires_at <= now()`,
      [orderId],
    );
    const o = await pool.query('SELECT id, store_id, status FROM orders WHERE id = $1', [orderId]);
    if (o.rowCount === 0) return;
    const order = o.rows[0] as { id: string; store_id: string; status: string };
    if (!DISPATCHABLE.includes(order.status)) return;
    const live = await pool.query(
      "SELECT id FROM offers WHERE order_id = $1 AND status = 'offered' AND (expires_at IS NULL OR expires_at > now()) LIMIT 1",
      [orderId],
    );
    if ((live.rowCount ?? 0) > 0) return;
    const riders = await pool.query(
      `SELECT u.id, u.name FROM rider_profiles rp
       JOIN users u ON u.id = rp.user_id
       JOIN stores s ON s.id = $2
       WHERE rp.status = 'online' AND rp.last_location IS NOT NULL
         AND u.id NOT IN (SELECT rider_id FROM offers WHERE order_id = $1)
       ORDER BY rp.last_location <-> s.location LIMIT 1`,
      [orderId, order.store_id],
    );
    if ((riders.rowCount ?? 0) === 0) {
      emitOrderUpdated(orderId, order.status); // nobody to offer to; leave unassigned
      return;
    }
    const rider = riders.rows[0] as { id: string; name: string };
    const off = await pool.query(
      `INSERT INTO offers (order_id, rider_id, status, expires_at)
       VALUES ($1, $2, 'offered', now() + interval '25 seconds') RETURNING *`,
      [orderId, rider.id],
    );
    const offer = off.rows[0] as Record<string, unknown>;
    emitOfferCreated({ ...offer, rider_name: rider.name }, orderId);
    emitOrderUpdated(orderId, order.status);
    scheduleOfferExpiry(offer['id'] as string, orderId);
  } catch (e) {
    app.log.error({ err: e, orderId }, 'dispatch failed');
  }
}

function scheduleOfferExpiry(offerId: string, orderId: string): void {
  setTimeout(() => {
    void (async () => {
      try {
        const r = await pool.query('SELECT id, status FROM offers WHERE id = $1', [offerId]);
        if ((r.rowCount ?? 0) === 0) return;
        if ((r.rows[0] as { status: string }).status !== 'offered') return;
        await pool.query("UPDATE offers SET status = 'expired' WHERE id = $1 AND status = 'offered'", [offerId]);
        const o = await pool.query('SELECT status FROM orders WHERE id = $1', [orderId]);
        if ((o.rowCount ?? 0) === 0) return;
        emitOrderUpdated(orderId, (o.rows[0] as { status: string }).status);
        await dispatchOrder(orderId); // re-offer next-nearest rider
      } catch (e) {
        app.log.error({ err: e, offerId }, 'offer expiry check failed');
      }
    })();
  }, 26000);
}

async function latestAcceptedRider(orderId: string): Promise<{ id: string; name: string } | null> {
  const r = await pool.query(
    `SELECT u.id, u.name FROM offers o JOIN users u ON u.id = o.rider_id
     WHERE o.order_id = $1 AND o.status = 'accepted' ORDER BY o.created_at DESC LIMIT 1`,
    [orderId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return r.rows[0] as { id: string; name: string };
}

// #5: on cancel / store-reject / support-refund, expire the order's live offers
// and flip the assigned rider (if any) back to 'online' so dispatch can reuse them.
async function releaseOrderAssignment(orderId: string): Promise<void> {
  const acc = await pool.query("SELECT rider_id FROM offers WHERE order_id = $1 AND status = 'accepted'", [
    orderId,
  ]);
  await pool.query(
    "UPDATE offers SET status = 'expired' WHERE order_id = $1 AND status IN ('offered', 'accepted')",
    [orderId],
  );
  for (const row of acc.rows as Array<{ rider_id: string }>) {
    await pool.query(
      "UPDATE rider_profiles SET status = 'online', updated_at = now() WHERE user_id = $1 AND status = 'busy'",
      [row.rider_id],
    );
  }
}

// #7: re-sweep unassigned DISPATCHABLE orders when a rider comes online (debounced).
let presenceSweepTimer: ReturnType<typeof setTimeout> | null = null;

async function sweepUnassignedDispatchable(): Promise<void> {
  try {
    const r = await pool.query(
      `SELECT id FROM orders WHERE status = ANY($1)
       AND NOT EXISTS (
         SELECT 1 FROM offers
         WHERE offers.order_id = orders.id
           AND (offers.status = 'accepted'
             OR (offers.status = 'offered'
               AND (offers.expires_at IS NULL OR offers.expires_at > now())))
       )
       ORDER BY created_at ASC LIMIT 20`,
      [DISPATCHABLE],
    );
    for (const row of r.rows as Array<{ id: string }>) {
      await dispatchOrder(row.id);
    }
  } catch (e) {
    app.log.error({ err: e }, 'presence sweep failed');
  }
}

function schedulePresenceSweep(): void {
  if (presenceSweepTimer) return; // debounce: collapse rapid presence flaps into one sweep
  presenceSweepTimer = setTimeout(() => {
    presenceSweepTimer = null;
    void sweepUnassignedDispatchable();
  }, 2000);
}

async function getOrderFull(orderId: string): Promise<Record<string, unknown> | null> {
  // #14: store UI renders buyer name/contact + item counts — join them here
  // instead of letting client normalizers silently fall back to placeholders.
  const o = await pool.query(
    `SELECT o.*, u.name AS buyer_name, u.email AS buyer_email, u.phone AS buyer_phone
     FROM orders o LEFT JOIN users u ON u.id = o.buyer_id WHERE o.id = $1`,
    [orderId],
  );
  if (o.rowCount === 0) return null;
  const order = o.rows[0] as Record<string, unknown>;
  const [items, store, payment, offer, tracking] = await Promise.all([
    pool.query('SELECT * FROM order_items WHERE order_id = $1', [orderId]),
    pool.query(
      `SELECT id, name, cuisine, image, rating,
              ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
       FROM stores WHERE id = $1`,
      [order['store_id']],
    ),
    pool.query('SELECT * FROM payments WHERE order_id = $1', [orderId]),
    pool.query(
      `SELECT o.*, u.name AS rider_name FROM offers o
       LEFT JOIN users u ON u.id = o.rider_id
       WHERE o.order_id = $1 ORDER BY o.created_at DESC LIMIT 1`,
      [orderId],
    ),
    pool.query(
      `SELECT ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng, heading, at
       FROM delivery_tracking WHERE order_id = $1 ORDER BY at ASC LIMIT 500`,
      [orderId],
    ),
  ]);
  return {
    ...order,
    items: items.rows,
    store: store.rows[0] ?? null,
    payment: payment.rows[0] ?? null,
    latest_offer: offer.rows[0] ?? null,
    tracking: tracking.rows,
  };
}

async function resolveOwnerStoreIds(
  ownerEmail?: string,
): Promise<{ ownerId: string; storeIds: string[] } | null> {
  let owner: { id: string } | undefined;
  if (ownerEmail) {
    const r = await pool.query("SELECT id FROM users WHERE email = $1 AND role = 'store_owner'", [ownerEmail]);
    if ((r.rowCount ?? 0) > 0) owner = r.rows[0] as { id: string };
  }
  // Fail CLOSED (issue #9): an unknown/missing owner must never inherit the
  // first owner's stores. Callers reply 403 on null.
  if (!owner) return null;
  const s = await pool.query('SELECT id FROM stores WHERE owner_id = $1', [owner.id]);
  return { ownerId: owner.id, storeIds: s.rows.map((x: { id: string }) => x.id) };
}

/** Owner-scoped routes: 403 when the stub identity resolves to nobody. */
async function requireOwnerStoreIds(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<{ ownerId: string; storeIds: string[] } | null> {
  const q = req.query as { ownerEmail?: string };
  const resolved = await resolveOwnerStoreIds(q.ownerEmail);
  if (!resolved) {
    reply.code(403).send({ error: 'owner_not_found' });
    return null;
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Stub auth hook
// ---------------------------------------------------------------------------

app.addHook('onRequest', async (req) => {
  const raw = req.headers['x-persona'];
  const v = Array.isArray(raw) ? raw[0] : raw;
  const p = (v ?? '').toString().trim().toLowerCase();
  req.persona = (PERSONAS as string[]).includes(p) ? (p as Persona) : undefined;
});

// ---------------------------------------------------------------------------
// Health + stores + menu
// ---------------------------------------------------------------------------

app.get('/health', async () => {
  const db = await pool
    .query('SELECT count(*)::int AS stores FROM stores')
    .catch((e: unknown) => ({ rows: [{ stores: -1, error: String(e) }] }));
  return { ok: true, service: 'kaoncdo-api', stores: (db as { rows: Array<{ stores: number }> }).rows[0].stores };
});

app.get('/api/stores', async () => {
  const { rows } = await pool.query(
    `SELECT id, name, cuisine, image, rating, delivery_fee, is_open,
            ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
     FROM stores ORDER BY name`,
  );
  return { stores: rows };
});

app.get<{ Params: { id: string } }>('/api/stores/:id/menu', async (req, reply) => {
  if (!uuidParam.safeParse(req.params.id).success) return badId(reply, 'store id');
  const store = await pool.query('SELECT id, name FROM stores WHERE id = $1', [req.params.id]);
  if (store.rowCount === 0) return reply.code(404).send({ error: 'store_not_found' });
  const [cats, items, options, choices] = await Promise.all([
    pool.query('SELECT * FROM menu_categories WHERE store_id = $1 ORDER BY sort ASC', [req.params.id]),
    pool.query('SELECT * FROM menu_items WHERE store_id = $1 ORDER BY name ASC', [req.params.id]),
    pool.query(
      `SELECT io.* FROM item_options io JOIN menu_items mi ON mi.id = io.item_id WHERE mi.store_id = $1`,
      [req.params.id],
    ),
    pool.query(
      `SELECT oc.* FROM option_choices oc
       JOIN item_options io ON io.id = oc.option_id
       JOIN menu_items mi ON mi.id = io.item_id WHERE mi.store_id = $1`,
      [req.params.id],
    ),
  ]);
  const choiceByOption = new Map<string, unknown[]>();
  for (const c of choices.rows as Array<{ option_id: string } & Record<string, unknown>>) {
    const arr = choiceByOption.get(c.option_id) ?? [];
    arr.push(c);
    choiceByOption.set(c.option_id, arr);
  }
  const optionsByItem = new Map<string, unknown[]>();
  for (const o of options.rows as Array<{ id: string; item_id: string } & Record<string, unknown>>) {
    const arr = optionsByItem.get(o.item_id) ?? [];
    arr.push({ ...o, choices: choiceByOption.get(o.id) ?? [] });
    optionsByItem.set(o.item_id, arr);
  }
  const itemsByCat = new Map<string, unknown[]>();
  const uncategorized: unknown[] = [];
  for (const it of items.rows as Array<{ id: string; category_id: string | null } & Record<string, unknown>>) {
    const withOpts = { ...it, options: optionsByItem.get(it.id) ?? [] };
    if (it.category_id && cats.rows.some((c: { id: string }) => c.id === it.category_id)) {
      const arr = itemsByCat.get(it.category_id) ?? [];
      arr.push(withOpts);
      itemsByCat.set(it.category_id, arr);
    } else {
      uncategorized.push(withOpts);
    }
  }
  return {
    store: store.rows[0],
    categories: (cats.rows as Array<{ id: string; name: string }>).map((c) => ({
      ...c,
      items: itemsByCat.get(c.id) ?? [],
    })),
    uncategorized,
  };
});

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

const createOrderSchema = z.object({
  storeId: z.string().uuid(),
  items: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        qty: z.number().int().min(1).max(50),
        choices: z.array(z.string().uuid()).default([]),
      }),
    )
    .min(1),
  buyerLat: z.number().min(-90).max(90),
  buyerLng: z.number().min(-180).max(180),
  promoCode: z.string().trim().min(1).max(32).optional(),
  paymentMethod: z.string().trim().min(1).max(32).default('cod'),
  buyerEmail: z.string().email().optional(),
});

app.post('/api/orders', async (req, reply) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
  const input = parsed.data;

  // idempotency: same key -> same order
  const rawKey = req.headers['idempotency-key'];
  const idemKey = (Array.isArray(rawKey) ? rawKey[0] : rawKey)?.toString();
  if (idemKey && idempotency.has(idemKey)) {
    const existing = await getOrderFull(idempotency.get(idemKey) as string);
    if (existing) return { order: existing, deduped: true };
    idempotency.delete(idemKey);
  }

  const storeR = await pool.query(
    `SELECT id, name, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
     FROM stores WHERE id = $1`,
    [input.storeId],
  );
  if (storeR.rowCount === 0) return reply.code(404).send({ error: 'store_not_found' });
  const store = storeR.rows[0] as { id: string; name: string; lat: number; lng: number };

  // buyer (stub identity)
  let buyerId: string;
  if (input.buyerEmail) {
    const b = await pool.query('SELECT id FROM users WHERE email = $1', [input.buyerEmail]);
    if (b.rowCount === 0) return reply.code(400).send({ error: 'buyer_not_found' });
    buyerId = (b.rows[0] as { id: string }).id;
  } else {
    const b = await pool.query("SELECT id FROM users WHERE role = 'buyer' ORDER BY created_at ASC LIMIT 1");
    buyerId = (b.rows[0] as { id: string }).id;
  }

  // validate items + choices, compute subtotal
  let subtotal = 0;
  const lines: Array<{ itemId: string; name: string; unitPrice: number; qty: number; options: unknown[]; lineTotal: number }> = [];
  for (const li of input.items) {
    const itR = await pool.query('SELECT * FROM menu_items WHERE id = $1 AND store_id = $2', [li.itemId, input.storeId]);
    if (itR.rowCount === 0) return reply.code(400).send({ error: 'item_not_found', itemId: li.itemId });
    const item = itR.rows[0] as { id: string; name: string; price: number; is_available: boolean };
    if (!item.is_available) return reply.code(400).send({ error: 'item_unavailable', itemId: li.itemId });
    let delta = 0;
    const optJson: unknown[] = [];
    if (li.choices.length > 0) {
      const chR = await pool.query(
        `SELECT oc.id, oc.name, oc.price_delta, io.item_id FROM option_choices oc
         JOIN item_options io ON io.id = oc.option_id WHERE oc.id = ANY($1)`,
        [li.choices],
      );
      if ((chR.rowCount ?? 0) !== li.choices.length) return reply.code(400).send({ error: 'invalid_choice' });
      for (const ch of chR.rows as Array<{ id: string; name: string; price_delta: number; item_id: string }>) {
        if (ch.item_id !== li.itemId) return reply.code(400).send({ error: 'invalid_choice', choiceId: ch.id });
        delta += ch.price_delta;
        optJson.push({ choiceId: ch.id, name: ch.name, price_delta: ch.price_delta });
      }
    }
    const unitPrice = Math.round(item.price + delta);
    const lineTotal = Math.round(unitPrice * li.qty);
    subtotal += lineTotal;
    lines.push({ itemId: item.id, name: item.name, unitPrice, qty: li.qty, options: optJson, lineTotal });
  }
  subtotal = Math.round(subtotal);

  const km = haversineKm(store.lat, store.lng, input.buyerLat, input.buyerLng);
  const deliveryFee = deliveryFeeForKm(km);
  const serviceFee = Math.round(subtotal * 0.05);

  // promo
  let discount = 0;
  let promoCode: string | null = null;
  if (input.promoCode) {
    const code = input.promoCode.toUpperCase();
    const pr = await pool.query('SELECT * FROM promotions WHERE code = $1', [code]);
    if ((pr.rowCount ?? 0) === 0) return reply.code(400).send({ error: 'invalid_promo' });
    const promo = pr.rows[0] as { kind: string; value: number; max_discount: number | null; min_order: number; active: boolean };
    if (!promo.active) return reply.code(400).send({ error: 'invalid_promo' });
    if (subtotal < promo.min_order)
      return reply.code(400).send({ error: 'promo_min_order', min_order: promo.min_order, subtotal });
    if (promo.kind === 'percent') {
      discount = Math.floor((subtotal * promo.value) / 100);
      if (promo.max_discount != null) discount = Math.min(discount, promo.max_discount);
    } else if (promo.kind === 'freeship') {
      discount = deliveryFee;
      if (promo.max_discount != null) discount = Math.min(discount, promo.max_discount);
    } else {
      discount = promo.value; // flat
    }
    discount = Math.max(0, Math.min(Math.round(discount), subtotal + deliveryFee + serviceFee));
    promoCode = code;
  }

  const total = Math.max(0, Math.round(subtotal + deliveryFee + serviceFee - discount));
  const pin = String(Math.floor(1000 + Math.random() * 9000));
  const nowIso = new Date().toISOString();

  // #6: order + items + payment must land atomically — single transaction.
  const client = await pool.connect();
  let order: { id: string };
  try {
    await client.query('BEGIN');
    const oR = await client.query(
      `INSERT INTO orders (buyer_id, store_id, status, subtotal, delivery_fee, service_fee, discount, total,
         promo_code, payment_method, payment_status, pickup_pin, buyer_lat, buyer_lng, timeline)
       VALUES ($1,$2,'placed',$3,$4,$5,$6,$7,$8,$9,'paid',$10,$11,$12,$13::jsonb) RETURNING *`,
      [
        buyerId,
        input.storeId,
        subtotal,
        deliveryFee,
        serviceFee,
        discount,
        total,
        promoCode,
        input.paymentMethod,
        pin,
        input.buyerLat,
        input.buyerLng,
        JSON.stringify([{ at: nowIso, status: 'placed' }]),
      ],
    );
    order = oR.rows[0] as { id: string };
    for (const ln of lines) {
      await client.query(
        `INSERT INTO order_items (order_id, item_id, name, unit_price, qty, options, line_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [order.id, ln.itemId, ln.name, ln.unitPrice, ln.qty, JSON.stringify(ln.options), ln.lineTotal],
      );
    }
    const ref = `MOCK-${Date.now().toString(36).toUpperCase()}`;
    await client.query(`INSERT INTO payments (order_id, method, amount, status, ref_code) VALUES ($1,$2,$3,'succeeded',$4)`, [
      order.id,
      input.paymentMethod,
      total,
      ref,
    ]);
    await client.query('COMMIT');
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* already failed; report the original error */
    }
    throw e;
  } finally {
    client.release();
  }

  if (idemKey) idempotency.set(idemKey, order.id);
  emitOrderUpdated(order.id, 'placed');
  void dispatchOrder(order.id); // auto-dispatch, best-effort

  const full = await getOrderFull(order.id);
  return reply.code(201).send({ order: full });
});

app.get<{ Params: { id: string } }>('/api/orders/:id', async (req, reply) => {
  if (!req.persona) return reply.code(403).send({ error: 'persona_required' });
  if (!uuidParam.safeParse(req.params.id).success) return badId(reply, 'order id');
  const full = await getOrderFull(req.params.id);
  if (!full) return reply.code(404).send({ error: 'order_not_found' });
  return { order: full };
});

app.post<{ Params: { id: string } }>('/api/orders/:id/cancel', async (req, reply) => {
  if (!uuidParam.safeParse(req.params.id).success) return badId(reply, 'order id');
  const r = await pool.query('SELECT id, status FROM orders WHERE id = $1', [req.params.id]);
  if (r.rowCount === 0) return reply.code(404).send({ error: 'order_not_found' });
  const status = (r.rows[0] as { status: string }).status;
  if (!['placed', 'store_accepted'].includes(status))
    return reply.code(409).send({ error: 'too_late_to_cancel', status });
  await setOrderStatus(req.params.id, 'cancelled', 'cancelled by buyer');
  await pool.query("UPDATE orders SET payment_status = 'refunded' WHERE id = $1", [req.params.id]);
  await pool.query("UPDATE payments SET status = 'refunded' WHERE order_id = $1", [req.params.id]);
  await releaseOrderAssignment(req.params.id); // #5: free rider + expire live offers
  emitOrderUpdated(req.params.id, 'cancelled');
  return { order: await getOrderFull(req.params.id) };
});

const paySchema = z.object({ method: z.string().trim().min(1).max(32) });

app.post<{ Params: { id: string } }>('/api/orders/:id/pay', async (req, reply) => {
  if (!uuidParam.safeParse(req.params.id).success) return badId(reply, 'order id');
  const parsed = paySchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
  const r = await pool.query('SELECT id FROM orders WHERE id = $1', [req.params.id]);
  if (r.rowCount === 0) return reply.code(404).send({ error: 'order_not_found' });
  const ref = `MOCK-${Date.now().toString(36).toUpperCase()}`;
  const o = await pool.query('SELECT total FROM orders WHERE id = $1', [req.params.id]);
  const total = (o.rows[0] as { total: number }).total;
  await pool.query(
    `INSERT INTO payments (order_id, method, amount, status, ref_code) VALUES ($1,$2,$3,'succeeded',$4)
     ON CONFLICT (order_id) DO UPDATE SET method = EXCLUDED.method, amount = EXCLUDED.amount,
       status = 'succeeded', ref_code = EXCLUDED.ref_code`,
    [req.params.id, parsed.data.method, total, ref],
  );
  await pool.query("UPDATE orders SET payment_method = $2, payment_status = 'paid' WHERE id = $1", [
    req.params.id,
    parsed.data.method,
  ]);
  emitOrderUpdated(req.params.id, ((await pool.query('SELECT status FROM orders WHERE id=$1', [req.params.id])).rows[0] as { status: string }).status);
  return { order: await getOrderFull(req.params.id) };
});

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional().default(''),
  target: z.enum(['store', 'rider']),
});

app.post<{ Params: { id: string } }>('/api/orders/:id/review', async (req, reply) => {
  if (!requirePersona(req, reply, ['buyer'])) return;
  if (!uuidParam.safeParse(req.params.id).success) return badId(reply, 'order id');
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
  const r = await pool.query('SELECT id, buyer_id, store_id, status FROM orders WHERE id = $1', [req.params.id]);
  if (r.rowCount === 0) return reply.code(404).send({ error: 'order_not_found' });
  const order = r.rows[0] as { id: string; buyer_id: string; store_id: string; status: string };
  // #8: reviews only for delivered orders, one per target.
  if (order.status !== 'delivered') return reply.code(409).send({ error: 'order_not_delivered', status: order.status });
  const dup = await pool.query(
    `SELECT id FROM reviews WHERE order_id = $1 AND
     ((store_id IS NOT NULL AND rider_id IS NULL AND $2 = 'store') OR
      (rider_id IS NOT NULL AND store_id IS NULL AND $2 = 'rider')) LIMIT 1`,
    [order.id, parsed.data.target],
  );
  if ((dup.rowCount ?? 0) > 0) return reply.code(409).send({ error: 'review_exists' });
  let storeId: string | null = null;
  let riderId: string | null = null;
  if (parsed.data.target === 'store') {
    storeId = order.store_id;
  } else {
    const rider = await latestAcceptedRider(order.id);
    if (!rider) return reply.code(400).send({ error: 'no_rider_on_order' });
    riderId = rider.id;
  }
  const ins = await pool.query(
    `INSERT INTO reviews (order_id, author_id, store_id, rider_id, rating, comment)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [order.id, order.buyer_id, storeId, riderId, parsed.data.rating, parsed.data.comment ?? ''],
  );
  return reply.code(201).send({ review: ins.rows[0] });
});

// ---------------------------------------------------------------------------
// Store owner routes (persona: store_owner)
// ---------------------------------------------------------------------------

app.get('/api/store/orders', async (req, reply) => {
  if (!requirePersona(req, reply, ['store_owner'])) return;
  const resolved = await requireOwnerStoreIds(req, reply);
  if (!resolved) return;
  const { storeIds } = resolved;
  if (storeIds.length === 0) return { orders: [] };
  const q = req.query as { status?: string };
  const params: unknown[] = [storeIds];
  let sql = `SELECT o.*, s.name AS store_name, u.name AS buyer_name,
                    u.email AS buyer_email, u.phone AS buyer_phone,
                    (SELECT count(*)::int FROM order_items WHERE order_id = o.id) AS items_count
             FROM orders o JOIN stores s ON s.id = o.store_id
             LEFT JOIN users u ON u.id = o.buyer_id
             WHERE o.store_id = ANY($1)`;
  if (q.status) {
    params.push(q.status);
    sql += ` AND o.status = $${params.length}`;
  }
  sql += ' ORDER BY o.created_at DESC LIMIT 100';
  const r = await pool.query(sql, params as unknown[]);
  return { orders: r.rows };
});

const storeActionSchema = z.object({ action: z.enum(['accept', 'reject', 'preparing', 'ready']) });

app.patch<{ Params: { id: string } }>('/api/store/orders/:id', async (req, reply) => {
  if (!requirePersona(req, reply, ['store_owner'])) return;
  if (!uuidParam.safeParse(req.params.id).success) return badId(reply, 'order id');
  const parsed = storeActionSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
  const resolved = await requireOwnerStoreIds(req, reply);
  if (!resolved) return;
  const { storeIds } = resolved;
  const r = await pool.query('SELECT id, store_id, status FROM orders WHERE id = $1', [req.params.id]);
  if (r.rowCount === 0) return reply.code(404).send({ error: 'order_not_found' });
  const order = r.rows[0] as { id: string; store_id: string; status: string };
  if (!storeIds.includes(order.store_id)) return reply.code(404).send({ error: 'order_not_found' });

  const action = parsed.data.action;
  let next: string | null = null;
  if (action === 'accept' && order.status === 'placed') next = 'store_accepted';
  else if (action === 'reject' && ['placed', 'store_accepted'].includes(order.status)) next = 'cancelled';
  else if (action === 'preparing' && order.status === 'store_accepted') next = 'preparing';
  else if (action === 'ready' && order.status === 'preparing') next = 'ready';
  if (!next) return reply.code(409).send({ error: 'invalid_transition', from: order.status, action });

  await setOrderStatus(order.id, next, `store:${action}`);
  if (next === 'cancelled') {
    await pool.query("UPDATE orders SET payment_status = 'refunded' WHERE id = $1", [order.id]);
    await pool.query("UPDATE payments SET status = 'refunded' WHERE order_id = $1", [order.id]);
    await releaseOrderAssignment(order.id); // #5: free rider + expire live offers
  }
  emitOrderUpdated(order.id, next);
  if (next === 'store_accepted' || next === 'ready') void dispatchOrder(order.id);
  return { order: await getOrderFull(order.id) };
});

// Issue #1: the store client fetches this route — it never existed.
app.get<{ Params: { id: string } }>('/api/store/orders/:id', async (req, reply) => {
  if (!requirePersona(req, reply, ['store_owner'])) return;
  if (!uuidParam.safeParse(req.params.id).success) return badId(reply, 'order id');
  const resolved = await requireOwnerStoreIds(req, reply);
  if (!resolved) return;
  const full = await getOrderFull(req.params.id);
  if (!full) return reply.code(404).send({ error: 'order_not_found' });
  if (!resolved.storeIds.includes((full as Record<string, unknown>).store_id as string))
    return reply.code(404).send({ error: 'order_not_found' });
  return { order: full };
});

app.get('/api/store/stats', async (req, reply) => {
  if (!requirePersona(req, reply, ['store_owner'])) return;
  const resolved = await requireOwnerStoreIds(req, reply);
  if (!resolved) return;
  const { ownerId, storeIds } = resolved;
  if (storeIds.length === 0)
    return { ownerId, revenue_today: 0, active_count: 0, delivered_today: 0, store_count: 0 };
  const rev = await pool.query(
    `SELECT COALESCE(SUM(total),0)::int AS revenue FROM orders
     WHERE store_id = ANY($1) AND status <> 'cancelled' AND created_at >= date_trunc('day', now())`,
    [storeIds],
  );
  const act = await pool.query(
    `SELECT count(*)::int AS active FROM orders
     WHERE store_id = ANY($1) AND status NOT IN ('delivered','cancelled')`,
    [storeIds],
  );
  // #14: the dashboard renders a delivered-today card — serve it instead of
  // letting the client normalize a missing field to a permanent 0.
  const done = await pool.query(
    `SELECT count(*)::int AS delivered FROM orders
     WHERE store_id = ANY($1) AND status = 'delivered' AND created_at >= date_trunc('day', now())`,
    [storeIds],
  );
  return {
    ownerId,
    store_count: storeIds.length,
    revenue_today: (rev.rows[0] as { revenue: number }).revenue,
    active_count: (act.rows[0] as { active: number }).active,
    delivered_today: (done.rows[0] as { delivered: number }).delivered,
  };
});

const menuItemPatchSchema = z.object({
  is_available: z.boolean().optional(),
  price: z.number().int().min(0).optional(),
});

app.patch<{ Params: { id: string } }>('/api/menu-items/:id', async (req, reply) => {
  if (!requirePersona(req, reply, ['store_owner'])) return;
  if (!uuidParam.safeParse(req.params.id).success) return badId(reply, 'menu item id');
  const parsed = menuItemPatchSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
  if (parsed.data.is_available === undefined && parsed.data.price === undefined)
    return reply.code(400).send({ error: 'nothing_to_update' });
  const resolved = await requireOwnerStoreIds(req, reply);
  if (!resolved) return;
  const { storeIds } = resolved;
  const r = await pool.query('SELECT * FROM menu_items WHERE id = $1', [req.params.id]);
  if (r.rowCount === 0) return reply.code(404).send({ error: 'menu_item_not_found' });
  const item = r.rows[0] as { store_id: string };
  if (!storeIds.includes(item.store_id)) return reply.code(404).send({ error: 'menu_item_not_found' });
  const sets: string[] = [];
  const params: unknown[] = [];
  if (parsed.data.is_available !== undefined) {
    params.push(parsed.data.is_available);
    sets.push(`is_available = $${params.length}`);
  }
  if (parsed.data.price !== undefined) {
    params.push(parsed.data.price);
    sets.push(`price = $${params.length}`);
  }
  params.push(req.params.id);
  const upd = await pool.query(`UPDATE menu_items SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params as unknown[]);
  return { item: upd.rows[0] };
});

// ---------------------------------------------------------------------------
// Dispatch / rider routes (persona: rider)
// ---------------------------------------------------------------------------

app.post<{ Params: { id: string } }>('/api/offers/:id/accept', async (req, reply) => {
  if (!requirePersona(req, reply, ['rider'])) return;
  if (!uuidParam.safeParse(req.params.id).success) return badId(reply, 'offer id');
  // #4: bind the caller to the offer — stub identity arrives via ?riderEmail=.
  const callerId = await resolveRiderId(req);
  let orderId = '';
  // #4: hold a row lock across check+assign so concurrent accepts serialize.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query('SELECT * FROM offers WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (r.rowCount === 0) {
      await client.query('ROLLBACK');
      return reply.code(404).send({ error: 'offer_not_found' });
    }
    const offer = r.rows[0] as { id: string; order_id: string; rider_id: string; status: string; expires_at: string | null };
    if (!callerId || callerId !== offer.rider_id) {
      await client.query('ROLLBACK');
      return reply.code(403).send({ error: 'offer_not_yours' });
    }
    if (offer.status !== 'offered') {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'offer_not_live', status: offer.status });
    }
    if (offer.expires_at && new Date(offer.expires_at).getTime() < Date.now()) {
      await client.query("UPDATE offers SET status = 'expired' WHERE id = $1 AND status = 'offered'", [offer.id]);
      await client.query('COMMIT');
      void dispatchOrder(offer.order_id);
      return reply.code(410).send({ error: 'offer_expired' });
    }
    const o = await client.query('SELECT id, status FROM orders WHERE id = $1 FOR UPDATE', [offer.order_id]);
    const order = o.rows[0] as { status: string };
    if (['delivered', 'cancelled', 'picked_up', 'delivering', 'rider_assigned'].includes(order.status)) {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'order_not_assignable', status: order.status });
    }
    orderId = offer.order_id;
    await client.query("UPDATE offers SET status = 'accepted' WHERE id = $1", [offer.id]);
    await client.query("UPDATE offers SET status = 'expired' WHERE order_id = $1 AND status = 'offered' AND id <> $2", [
      offer.order_id,
      offer.id,
    ]);
    const nowIso = new Date().toISOString();
    await client.query('UPDATE orders SET status = $2, updated_at = now() WHERE id = $1', [offer.order_id, 'rider_assigned']);
    await client.query('UPDATE orders SET timeline = timeline || $2::jsonb, updated_at = now() WHERE id = $1', [
      offer.order_id,
      JSON.stringify({ at: nowIso, status: 'rider_assigned', note: `rider accepted offer ${offer.id}` }),
    ]);
    await client.query("UPDATE rider_profiles SET status = 'busy', updated_at = now() WHERE user_id = $1", [offer.rider_id]);
    await client.query('COMMIT');
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* report the original error */
    }
    throw e;
  } finally {
    client.release();
  }
  emitOfferCreated({ id: req.params.id, status: 'accepted' }, orderId);
  emitOrderUpdated(orderId, 'rider_assigned');
  return { order: await getOrderFull(orderId) };
});

app.post<{ Params: { id: string } }>('/api/offers/:id/decline', async (req, reply) => {
  if (!requirePersona(req, reply, ['rider'])) return;
  if (!uuidParam.safeParse(req.params.id).success) return badId(reply, 'offer id');
  const r = await pool.query('SELECT * FROM offers WHERE id = $1', [req.params.id]);
  if (r.rowCount === 0) return reply.code(404).send({ error: 'offer_not_found' });
  const offer = r.rows[0] as { id: string; order_id: string; status: string };
  if (offer.status !== 'offered') return reply.code(409).send({ error: 'offer_not_live', status: offer.status });
  // #4: riders decline only their own offers (declining re-triggers dispatch).
  const callerId = await resolveRiderId(req);
  if (!callerId || callerId !== (r.rows[0] as { rider_id: string }).rider_id)
    return reply.code(403).send({ error: 'offer_not_yours' });
  await pool.query("UPDATE offers SET status = 'declined' WHERE id = $1", [offer.id]);
  const o = await pool.query('SELECT status FROM orders WHERE id = $1', [offer.order_id]);
  if ((o.rowCount ?? 0) > 0) emitOrderUpdated(offer.order_id, (o.rows[0] as { status: string }).status);
  void dispatchOrder(offer.order_id); // auto re-offer next rider
  return { ok: true, offer_id: offer.id, status: 'declined' };
});

const presenceSchema = z.object({
  status: z.enum(['offline', 'online', 'busy']),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  riderId: z.string().uuid().optional(),
  riderEmail: z.string().email().optional(),
});

app.post('/api/rider/presence', async (req, reply) => {
  if (!requirePersona(req, reply, ['rider'])) return;
  const parsed = presenceSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
  const q = req.query as { riderEmail?: string };
  let riderId: string | undefined = parsed.data.riderId;
  const email = parsed.data.riderEmail ?? q.riderEmail;
  if (!riderId && email) {
    const u = await pool.query("SELECT id FROM users WHERE email = $1 AND role = 'rider'", [email]);
    if ((u.rowCount ?? 0) === 0) return reply.code(404).send({ error: 'rider_not_found' });
    riderId = (u.rows[0] as { id: string }).id;
  }
  if (!riderId) {
    const u = await pool.query("SELECT id FROM users WHERE role = 'rider' ORDER BY created_at ASC LIMIT 1");
    riderId = (u.rows[0] as { id: string }).id;
  }
  await pool.query(
    `INSERT INTO rider_profiles (user_id, status, last_location, updated_at)
     VALUES ($1, $2, ST_GeogFromText('SRID=4326;POINT(' || $3 || ' ' || $4 || ')'), now())
     ON CONFLICT (user_id) DO UPDATE SET status = EXCLUDED.status,
       last_location = EXCLUDED.last_location, updated_at = now()`,
    [riderId, parsed.data.status, String(parsed.data.lng), String(parsed.data.lat)],
  );
  const cur = await pool.query(
    `SELECT u.id, u.name, rp.status, rp.vehicle,
            ST_Y(rp.last_location::geometry) AS lat, ST_X(rp.last_location::geometry) AS lng
     FROM rider_profiles rp JOIN users u ON u.id = rp.user_id WHERE u.id = $1`,
    [riderId],
  );
  if (parsed.data.status === 'online') schedulePresenceSweep(); // #7: re-sweep stalled dispatchables
  return { rider: cur.rows[0] };
});

const pickupSchema = z.object({ pin: z.string().min(4).max(8) });

// #10: brute-force brake for the 4-digit pickup PIN. In-memory (resets on
// restart — acceptable for the POC; a persistent counter belongs with #16).
// 10 wrong tries lock the order for 5 minutes.
const pinAttempts = new Map<string, { fails: number; lockedUntil: number }>();
const PIN_MAX_FAILS = 10;
const PIN_LOCK_MS = 5 * 60 * 1000;

app.post<{ Params: { id: string } }>('/api/orders/:id/pickup', async (req, reply) => {
  if (!requirePersona(req, reply, ['rider'])) return;
  if (!uuidParam.safeParse(req.params.id).success) return badId(reply, 'order id');
  const parsed = pickupSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
  const r = await pool.query('SELECT id, status, pickup_pin FROM orders WHERE id = $1', [req.params.id]);
  if (r.rowCount === 0) return reply.code(404).send({ error: 'order_not_found' });
  const order = r.rows[0] as { id: string; status: string; pickup_pin: string | null };
  if (!['rider_assigned', 'delivering'].includes(order.status))
    return reply.code(409).send({ error: 'not_ready_for_pickup', status: order.status });
  const gate = pinAttempts.get(order.id);
  if (gate && gate.lockedUntil > Date.now())
    return reply.code(429).send({ error: 'pin_locked_out', retry_after_ms: gate.lockedUntil - Date.now() });
  if ((order.pickup_pin ?? '') !== parsed.data.pin) {
    const fails = (gate?.fails ?? 0) + 1;
    pinAttempts.set(order.id, {
      fails,
      lockedUntil: fails >= PIN_MAX_FAILS ? Date.now() + PIN_LOCK_MS : 0,
    });
    return reply.code(400).send({ error: 'bad_pin', attempts_left: Math.max(0, PIN_MAX_FAILS - fails) });
  }
  pinAttempts.delete(order.id);
  await setOrderStatus(order.id, 'picked_up', 'picked up by rider');
  emitOrderUpdated(order.id, 'picked_up');
  return { order: await getOrderFull(order.id) };
});

app.post<{ Params: { id: string } }>('/api/orders/:id/deliver', async (req, reply) => {
  if (!requirePersona(req, reply, ['rider'])) return;
  if (!uuidParam.safeParse(req.params.id).success) return badId(reply, 'order id');
  const r = await pool.query('SELECT id, status FROM orders WHERE id = $1', [req.params.id]);
  if (r.rowCount === 0) return reply.code(404).send({ error: 'order_not_found' });
  const order = r.rows[0] as { id: string; status: string };
  if (!['picked_up', 'delivering'].includes(order.status))
    return reply.code(409).send({ error: 'not_out_for_delivery', status: order.status });
  await setOrderStatus(order.id, 'delivered', 'delivered to buyer');
  const rider = await latestAcceptedRider(order.id);
  if (rider) await pool.query("UPDATE rider_profiles SET status = 'online', updated_at = now() WHERE user_id = $1", [rider.id]);
  emitOrderUpdated(order.id, 'delivered');
  return { order: await getOrderFull(order.id) };
});

const trackingSchema = z.object({
  orderId: z.string().uuid(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  heading: z.number().min(0).max(360).nullable().optional(),
});

app.post('/api/tracking', async (req, reply) => {
  if (!requirePersona(req, reply, ['rider'])) return;
  const parsed = trackingSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
  const o = await pool.query('SELECT id FROM orders WHERE id = $1', [parsed.data.orderId]);
  if (o.rowCount === 0) return reply.code(404).send({ error: 'order_not_found' });
  const rider = await latestAcceptedRider(parsed.data.orderId);
  const ins = await pool.query(
    `INSERT INTO delivery_tracking (order_id, rider_id, geom, heading)
     VALUES ($1, $2, ST_GeogFromText('SRID=4326;POINT(' || $3 || ' ' || $4 || ')'), $5)
     RETURNING id, at`,
    [parsed.data.orderId, rider?.id ?? null, String(parsed.data.lng), String(parsed.data.lat), parsed.data.heading ?? null],
  );
  emitTrackingPoint(parsed.data.orderId, parsed.data.lat, parsed.data.lng, parsed.data.heading ?? null);
  return reply.code(201).send({ point: { ...ins.rows[0], ...parsed.data } });
});

app.get<{ Params: { id: string } }>('/api/orders/:id/tracking', async (req, reply) => {
  if (!req.persona) return reply.code(403).send({ error: 'persona_required' });
  if (!uuidParam.safeParse(req.params.id).success) return badId(reply, 'order id');
  const o = await pool.query('SELECT id FROM orders WHERE id = $1', [req.params.id]);
  if (o.rowCount === 0) return reply.code(404).send({ error: 'order_not_found' });
  const r = await pool.query(
    `SELECT ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng, heading, speed, at
     FROM delivery_tracking WHERE order_id = $1 ORDER BY at ASC LIMIT 500`,
    [req.params.id],
  );
  return { orderId: req.params.id, points: r.rows };
});

async function resolveRiderId(req: { query?: unknown }): Promise<string | null> {
  const q = (req.query ?? {}) as { riderEmail?: string; riderId?: string };
  if (q.riderId) return q.riderId;
  if (q.riderEmail) {
    const u = await pool.query("SELECT id FROM users WHERE email = $1 AND role = 'rider'", [q.riderEmail]);
    if ((u.rowCount ?? 0) > 0) return (u.rows[0] as { id: string }).id;
    return null;
  }
  const u = await pool.query("SELECT id FROM users WHERE role = 'rider' ORDER BY created_at ASC LIMIT 1");
  return (u.rows[0] as { id: string }).id;
}

app.get('/api/rider/offers', async (req, reply) => {
  if (!requirePersona(req, reply, ['rider'])) return;
  const riderId = await resolveRiderId(req);
  if (!riderId) return reply.code(404).send({ error: 'rider_not_found' });
  const r = await pool.query(
    `SELECT ofr.id, ofr.order_id, ofr.status, ofr.expires_at, o.total, o.created_at,
            s.name AS store_name, s.delivery_fee
     FROM offers ofr JOIN orders o ON o.id = ofr.order_id
     JOIN stores s ON s.id = o.store_id
     WHERE ofr.rider_id = $1 AND ofr.status = 'offered' AND ofr.expires_at > now()
     ORDER BY ofr.created_at DESC`,
    [riderId],
  );
  return { riderId, offers: r.rows };
});

app.get('/api/rider/active', async (req, reply) => {
  if (!requirePersona(req, reply, ['rider'])) return;
  const riderId = await resolveRiderId(req);
  if (!riderId) return reply.code(404).send({ error: 'rider_not_found' });
  const r = await pool.query(
    `SELECT o.id FROM orders o JOIN offers ofr ON ofr.order_id = o.id
     WHERE ofr.rider_id = $1 AND ofr.status = 'accepted'
       AND o.status IN ('rider_assigned','picked_up','delivering')
     ORDER BY o.created_at DESC LIMIT 1`,
    [riderId],
  );
  if ((r.rowCount ?? 0) === 0) return { riderId, order: null };
  return { riderId, order: await getOrderFull((r.rows[0] as { id: string }).id) };
});

// ---------------------------------------------------------------------------
// Ops routes (persona: operator)
// ---------------------------------------------------------------------------

app.get('/api/ops/live', async (req, reply) => {
  if (!requirePersona(req, reply, ['operator', 'support'])) return;
  const riders = await pool.query(
    `SELECT u.id, u.name, rp.status, rp.vehicle,
            ST_Y(rp.last_location::geometry) AS lat, ST_X(rp.last_location::geometry) AS lng,
            rp.updated_at
     FROM rider_profiles rp JOIN users u ON u.id = rp.user_id
     WHERE rp.status IN ('online','busy') ORDER BY u.name`,
  );
  const orders = await pool.query(
    `SELECT o.id, o.status, o.total, o.created_at, s.name AS store_name, u.name AS buyer_name
     FROM orders o JOIN stores s ON s.id = o.store_id JOIN users u ON u.id = o.buyer_id
     WHERE o.status NOT IN ('delivered','cancelled') ORDER BY o.created_at DESC LIMIT 100`,
  );
  return { riders: riders.rows, active_orders: orders.rows };
});

const assignSchema = z.object({ orderId: z.string().uuid(), riderId: z.string().uuid() });

app.post('/api/ops/assign', async (req, reply) => {
  if (!requirePersona(req, reply, ['operator', 'support'])) return;
  const parsed = assignSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
  const o = await pool.query('SELECT id, status FROM orders WHERE id = $1', [parsed.data.orderId]);
  if (o.rowCount === 0) return reply.code(404).send({ error: 'order_not_found' });
  const order = o.rows[0] as { status: string };
  if (['delivered', 'cancelled'].includes(order.status))
    return reply.code(409).send({ error: 'order_closed', status: order.status });
  const u = await pool.query("SELECT id, name FROM users WHERE id = $1 AND role = 'rider'", [parsed.data.riderId]);
  if (u.rowCount === 0) return reply.code(404).send({ error: 'rider_not_found' });
  await pool.query("UPDATE offers SET status = 'expired' WHERE order_id = $1 AND status = 'offered'", [parsed.data.orderId]);
  const off = await pool.query(
    `INSERT INTO offers (order_id, rider_id, status) VALUES ($1,$2,'accepted') RETURNING *`,
    [parsed.data.orderId, parsed.data.riderId],
  );
  await setOrderStatus(parsed.data.orderId, 'rider_assigned', `force-assigned to ${(u.rows[0] as { name: string }).name} by ops`);
  await pool.query("UPDATE rider_profiles SET status = 'busy', updated_at = now() WHERE user_id = $1", [parsed.data.riderId]);
  emitOfferCreated(off.rows[0], parsed.data.orderId);
  emitOrderUpdated(parsed.data.orderId, 'rider_assigned');
  return { order: await getOrderFull(parsed.data.orderId) };
});

const broadcastSchema = z.object({ message: z.string().trim().min(1).max(500) });

app.post('/api/ops/broadcast', async (req, reply) => {
  if (!requirePersona(req, reply, ['operator'])) return;
  const parsed = broadcastSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
  emitOpsBroadcast(parsed.data.message);
  return { ok: true, message: parsed.data.message };
});

app.get('/api/ops/promos', async (req, reply) => {
  if (!requirePersona(req, reply, ['operator'])) return;
  const r = await pool.query('SELECT * FROM promotions ORDER BY code ASC');
  return { promos: r.rows };
});

const promoCreateSchema = z.object({
  code: z.string().trim().min(1).max(32),
  kind: z.enum(['percent', 'flat', 'freeship']),
  value: z.number().int().min(0),
  max_discount: z.number().int().min(0).nullable().optional(),
  min_order: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
});

app.post('/api/ops/promos', async (req, reply) => {
  if (!requirePersona(req, reply, ['operator'])) return;
  const parsed = promoCreateSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
  const code = parsed.data.code.toUpperCase();
  const exists = await pool.query('SELECT code FROM promotions WHERE code = $1', [code]);
  if ((exists.rowCount ?? 0) > 0) return reply.code(409).send({ error: 'promo_exists' });
  const ins = await pool.query(
    `INSERT INTO promotions (code, kind, value, max_discount, min_order, active)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [code, parsed.data.kind, parsed.data.value, parsed.data.max_discount ?? null, parsed.data.min_order, parsed.data.active],
  );
  return reply.code(201).send({ promo: ins.rows[0] });
});

// ---------------------------------------------------------------------------
// Support routes (open stub; persona optional)
// ---------------------------------------------------------------------------

app.get('/api/tickets', async (req) => {
  const q = req.query as { status?: string };
  const params: unknown[] = [];
  let sql = `SELECT t.*, u.name AS opener_name, u.email AS opener_email,
              (SELECT count(*)::int FROM ticket_messages m WHERE m.ticket_id = t.id) AS message_count
             FROM tickets t JOIN users u ON u.id = t.opener_id`;
  if (q.status) {
    params.push(q.status);
    sql += ` WHERE t.status = $${params.length}`;
  }
  sql += ' ORDER BY t.created_at DESC LIMIT 100';
  const r = await pool.query(sql, params as unknown[]);
  return { tickets: r.rows };
});

const ticketCreateSchema = z.object({
  orderId: z.string().uuid().optional(),
  subject: z.string().trim().min(1).max(300),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  openerEmail: z.string().email().optional(),
});

app.post('/api/tickets', async (req, reply) => {
  const parsed = ticketCreateSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
  if (parsed.data.orderId) {
    const o = await pool.query('SELECT id FROM orders WHERE id = $1', [parsed.data.orderId]);
    if (o.rowCount === 0) return reply.code(404).send({ error: 'order_not_found' });
  }
  let openerId: string;
  if (parsed.data.openerEmail) {
    const u = await pool.query('SELECT id FROM users WHERE email = $1', [parsed.data.openerEmail]);
    if (u.rowCount === 0) return reply.code(400).send({ error: 'opener_not_found' });
    openerId = (u.rows[0] as { id: string }).id;
  } else {
    const u = await pool.query("SELECT id FROM users WHERE role = 'buyer' ORDER BY created_at ASC LIMIT 1");
    openerId = (u.rows[0] as { id: string }).id;
  }
  const ins = await pool.query(
    `INSERT INTO tickets (order_id, opener_id, subject, priority) VALUES ($1,$2,$3,$4) RETURNING *`,
    [parsed.data.orderId ?? null, openerId, parsed.data.subject, parsed.data.priority],
  );
  emitTicketUpdated(ins.rows[0]);
  return reply.code(201).send({ ticket: ins.rows[0] });
});

app.get<{ Params: { id: string } }>('/api/tickets/:id', async (req, reply) => {
  if (!uuidParam.safeParse(req.params.id).success) return badId(reply, 'ticket id');
  const t = await pool.query('SELECT * FROM tickets WHERE id = $1', [req.params.id]);
  if (t.rowCount === 0) return reply.code(404).send({ error: 'ticket_not_found' });
  const m = await pool.query('SELECT * FROM ticket_messages WHERE ticket_id = $1 ORDER BY created_at ASC', [req.params.id]);
  return { ticket: t.rows[0], messages: m.rows };
});

const ticketMsgSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  sender_role: z.string().trim().min(1).max(32).default('support'),
});

app.post<{ Params: { id: string } }>('/api/tickets/:id/messages', async (req, reply) => {
  if (!req.persona) return reply.code(403).send({ error: 'persona_required' });
  if (!uuidParam.safeParse(req.params.id).success) return badId(reply, 'ticket id');
  const parsed = ticketMsgSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
  const t = await pool.query('SELECT * FROM tickets WHERE id = $1', [req.params.id]);
  if (t.rowCount === 0) return reply.code(404).send({ error: 'ticket_not_found' });
  const ins = await pool.query(`INSERT INTO ticket_messages (ticket_id, sender_role, body) VALUES ($1,$2,$3) RETURNING *`, [
    req.params.id,
    parsed.data.sender_role,
    parsed.data.body,
  ]);
  emitTicketUpdated({ ticket_id: req.params.id, message: ins.rows[0] });
  return reply.code(201).send({ message: ins.rows[0] });
});

app.post<{ Params: { id: string } }>('/api/tickets/:id/resolve', async (req, reply) => {
  if (!requirePersona(req, reply, ['operator', 'support'])) return;
  if (!uuidParam.safeParse(req.params.id).success) return badId(reply, 'ticket id');
  const upd = await pool.query("UPDATE tickets SET status = 'resolved' WHERE id = $1 RETURNING *", [req.params.id]);
  if (upd.rowCount === 0) return reply.code(404).send({ error: 'ticket_not_found' });
  emitTicketUpdated(upd.rows[0]);
  return { ticket: upd.rows[0] };
});

app.post<{ Params: { id: string } }>('/api/tickets/:id/refund', async (req, reply) => {
  if (!requirePersona(req, reply, ['operator', 'support'])) return;
  if (!uuidParam.safeParse(req.params.id).success) return badId(reply, 'ticket id');
  const t = await pool.query('SELECT * FROM tickets WHERE id = $1', [req.params.id]);
  if (t.rowCount === 0) return reply.code(404).send({ error: 'ticket_not_found' });
  const ticket = t.rows[0] as { id: string; order_id: string | null };
  if (!ticket.order_id) return reply.code(400).send({ error: 'ticket_has_no_order' });
  // #3: refunds only make sense on terminal orders — a placed/preparing order
  // keeps flowing after a refund, which is incoherent. Cancel first instead.
  const st = await pool.query('SELECT status FROM orders WHERE id = $1', [ticket.order_id]);
  if (st.rowCount === 0) return reply.code(404).send({ error: 'order_not_found' });
  const orderStatus = (st.rows[0] as { status: string }).status;
  if (!['delivered', 'cancelled'].includes(orderStatus))
    return reply.code(409).send({ error: 'order_not_refundable', status: orderStatus });
  await pool.query("UPDATE payments SET status = 'refunded' WHERE order_id = $1", [ticket.order_id]);
  await pool.query("UPDATE orders SET payment_status = 'refunded' WHERE id = $1", [ticket.order_id]);
  // #5: orderStatus is terminal here (guarded above), so freeing is always safe.
  await releaseOrderAssignment(ticket.order_id);
  await appendTimeline(ticket.order_id, orderStatus, `refunded via support ticket ${ticket.id}`);
  emitOrderUpdated(ticket.order_id, orderStatus);
  emitTicketUpdated({ ticket_id: ticket.id, refunded_order: ticket.order_id });
  return { ok: true, order: await getOrderFull(ticket.order_id) };
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

await maybeInitRedis();

const port = Number(process.env.API_PORT ?? 3001);
await app.listen({ port, host: '0.0.0.0' });

io = new SocketIOServer(app.server, { cors: { origin: ALLOWED_ORIGINS } });
io.on('connection', (socket) => {
  socket.on('join-order', (payload: unknown) => {
    const orderId =
      typeof payload === 'string' ? payload : (payload as { orderId?: string } | null)?.orderId;
    // Reject garbage room names — rooms are order UUIDs or city.ops only.
    if (orderId && uuidParam.safeParse(orderId).success) void socket.join(`order:${orderId}`);
  });
  socket.on('join-ops', () => {
    void socket.join('city.ops');
  });
});
app.log.info(`kaoncdo-api listening on :${port} (+socket.io)`);
