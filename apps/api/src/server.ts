import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import { Pool } from 'pg';
import { Server as SocketIOServer } from 'socket.io';
import { z } from 'zod';
import net from 'node:net';

// KaonCDO food-delivery POC API. Raw pg + zod. Redis optional/best-effort.

type Persona = 'buyer' | 'store_owner' | 'rider' | 'operator' | 'support';
const PERSONAS: Persona[] = ['buyer', 'store_owner', 'rider', 'operator', 'support'];

declare module 'fastify' {
  interface FastifyRequest { persona?: Persona }
}

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

// Lenient bodies: empty JSON / urlencoded posts count as no body (some clients always send a content-type).
for (const t of ['application/json', 'application/x-www-form-urlencoded'])
  app.addContentTypeParser(t, { parseAs: 'string' }, (req, body, done) => {
    try {
      if (!body) return done(null, undefined);
      const isJson = String(req.headers['content-type'] ?? '').includes('json');
      done(null, isJson ? JSON.parse(body as string) : Object.fromEntries(new URLSearchParams(body as string)));
    } catch (e) {
      done(e as Error);
    }
  });

const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? 'postgres://kaon:kaonpw@localhost:5432/kaoncdo' });
const idempotency = new Map<string, string>(); // Idempotency-Key -> orderId (POC, in-memory)
let io: SocketIOServer | undefined;

// --- query + guards + geo + emits -------------------------------------------
const q = (text: string, params?: unknown[]) => (params ? pool.query(text, params as never[]) : pool.query(text));
const one = async <T>(text: string, params?: unknown[]): Promise<T | null> => ((await q(text, params)).rows[0] as T | undefined) ?? null;
// One guard for persona + uuid params (replaces requirePersona/badId/uuidParam at call sites).
const ok = (req: FastifyRequest, reply: FastifyReply, allow?: Persona[], id?: string, what = 'id'): boolean => {
  if (allow && (!req.persona || !allow.includes(req.persona))) {
    reply.code(403).send({ error: 'forbidden', need: allow, have: req.persona ?? null });
    return false;
  }
  if (id !== undefined && !z.string().uuid().safeParse(id).success) {
    reply.code(400).send({ error: 'invalid_id', what });
    return false;
  }
  return true;
};
const badBody = (reply: FastifyReply, issues: unknown) => reply.code(400).send({ error: 'invalid_body', issues });
/** haversine km; fee = 39 base + 8/km store->buyer, min 39. Whole pesos. */
const haversineKm = (a: number, b: number, c: number, d: number): number => {
  const R = 6371, r = Math.PI / 180, s1 = Math.sin(((c - a) * r) / 2), s2 = Math.sin(((d - b) * r) / 2);
  return 2 * R * Math.asin(Math.sqrt(s1 * s1 + Math.cos(a * r) * Math.cos(c * r) * s2 * s2));
};
const deliveryFeeForKm = (km: number): number => Math.max(39, Math.round(39 + 8 * km));
// One fan-out (replaces 5 emit* helpers): order room (when orderId) + city.ops + global.
const emit = (ev: string, payload: unknown, orderId?: string): void => {
  if (!io) return;
  if (orderId) io.to(`order:${orderId}`).emit(ev, payload);
  io.to('city.ops').emit(ev, payload);
  io.emit(ev, payload);
};
const appendTimeline = (id: string, status: string, note?: string) =>
  q('UPDATE orders SET timeline = timeline || $2::jsonb, updated_at = now() WHERE id = $1', [id, JSON.stringify({ at: new Date().toISOString(), status, ...(note ? { note } : {}) })]);
const setOrderStatus = async (id: string, status: string, note?: string) => {
  await q('UPDATE orders SET status = $2, updated_at = now() WHERE id = $1', [id, status]);
  await appendTimeline(id, status, note);
};
const refundPay = (id: string) =>
  Promise.all([
    q("UPDATE orders SET payment_status = 'refunded' WHERE id = $1", [id]),
    q("UPDATE payments SET status = 'refunded' WHERE order_id = $1", [id]),
  ]);
// State-machine tables (replace if-if-if chains).
const STORE_NEXT: Record<string, Record<string, string>> = {
  accept: { placed: 'store_accepted' },
  reject: { placed: 'cancelled', store_accepted: 'cancelled' },
  preparing: { store_accepted: 'preparing' },
  ready: { preparing: 'ready' },
};
const CANCELLABLE = ['placed', 'store_accepted'];
const CLOSED = ['delivered', 'cancelled'];
const NOT_ASSIGNABLE = ['delivered', 'cancelled', 'picked_up', 'delivering'];
const PICKABLE = ['rider_assigned', 'delivering'];
const DELIVERABLE = ['picked_up', 'delivering'];
const DISPATCHABLE = ['placed', 'store_accepted', 'preparing', 'ready'];

// --- redis (lazy / best-effort) ----------------------------------------------
async function maybeInitRedis(): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) return void app.log.info('REDIS_URL not set — running without Redis (in-memory idempotency)');
  const m = /^redis:\/\/([^:/]+)(?::(\d+))?/.exec(url);
  if (!m) return void app.log.warn('REDIS_URL unparseable — skipping Redis');
  await new Promise<void>((resolve) => {
    const sock = net.connect({ host: m[1] as string, port: Number(m[2] ?? 6379) });
    const done = (up: boolean) => {
      try { sock.destroy(); } catch { /* noop */ }
      app.log.info(up ? 'Redis reachable (unused in POC paths)' : 'Redis unreachable — continuing without it');
      resolve();
    };
    const t = setTimeout(() => done(false), 1500);
    sock.on('connect', () => { clearTimeout(t); done(true); });
    sock.on('error', () => { clearTimeout(t); done(false); });
  });
}

// --- dispatch: nearest online rider, 25s expiry + re-offer loop ---------------
async function dispatchOrder(orderId: string): Promise<void> {
  try {
    const order = await one<{ id: string; store_id: string; status: string }>('SELECT id, store_id, status FROM orders WHERE id = $1', [orderId]);
    if (!order) return;
    if (!DISPATCHABLE.includes(order.status)) return;
    if (await one("SELECT id FROM offers WHERE order_id = $1 AND status = 'offered' AND (expires_at IS NULL OR expires_at > now()) LIMIT 1", [orderId])) return;
    const riders = await q(`SELECT u.id, u.name FROM rider_profiles rp JOIN users u ON u.id = rp.user_id JOIN stores s ON s.id = $2 WHERE rp.status = 'online' AND rp.last_location IS NOT NULL AND u.id NOT IN (SELECT rider_id FROM offers WHERE order_id = $1) ORDER BY rp.last_location <-> s.location LIMIT 1`, [orderId, order.store_id]);
    if ((riders.rowCount ?? 0) === 0) return void emit('order.updated', { orderId, status: order.status }, orderId);
    const rider = riders.rows[0] as { id: string; name: string };
    const offer = (await one<Record<string, unknown>>(`INSERT INTO offers (order_id, rider_id, status, expires_at) VALUES ($1, $2, 'offered', now() + interval '25 seconds') RETURNING *`, [orderId, rider.id])) as Record<string, unknown>;
    emit('offer.created', { ...offer, rider_name: rider.name }, orderId);
    emit('order.updated', { orderId, status: order.status }, orderId);
    scheduleOfferExpiry(offer['id'] as string, orderId);
  } catch (e) {
    app.log.error({ err: e, orderId }, 'dispatch failed');
  }
}
function scheduleOfferExpiry(offerId: string, orderId: string): void {
  setTimeout(() => {
    void (async () => {
      try {
        const r = await one<{ status: string }>('SELECT id, status FROM offers WHERE id = $1', [offerId]);
        if (r?.status !== 'offered') return;
        await q("UPDATE offers SET status = 'expired' WHERE id = $1 AND status = 'offered'", [offerId]);
        const o = await one<{ status: string }>('SELECT status FROM orders WHERE id = $1', [orderId]);
        if (!o) return;
        emit('order.updated', { orderId, status: o.status }, orderId);
        await dispatchOrder(orderId);
      } catch (e) {
        app.log.error({ err: e, offerId }, 'offer expiry check failed');
      }
    })();
  }, 26000);
}
async function latestAcceptedRider(orderId: string): Promise<{ id: string; name: string } | null> {
  return one<{ id: string; name: string }>(`SELECT u.id, u.name FROM offers o JOIN users u ON u.id = o.rider_id WHERE o.order_id = $1 AND o.status = 'accepted' ORDER BY o.created_at DESC LIMIT 1`, [orderId]);
}
async function getOrderFull(orderId: string): Promise<Record<string, unknown> | null> {
  const order = await one<Record<string, unknown>>('SELECT * FROM orders WHERE id = $1', [orderId]);
  if (!order) return null;
  const [items, store, payment, offer, tracking] = await Promise.all([
    q('SELECT * FROM order_items WHERE order_id = $1', [orderId]),
    q(`SELECT id, name, cuisine, image, rating, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng FROM stores WHERE id = $1`, [order['store_id']]),
    q('SELECT * FROM payments WHERE order_id = $1', [orderId]),
    q(`SELECT o.*, u.name AS rider_name FROM offers o LEFT JOIN users u ON u.id = o.rider_id WHERE o.order_id = $1 ORDER BY o.created_at DESC LIMIT 1`, [orderId]),
    q(`SELECT ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng, heading, at FROM delivery_tracking WHERE order_id = $1 ORDER BY at ASC LIMIT 500`, [orderId]),
  ]);
  return { ...order, items: items.rows, store: store.rows[0] ?? null, payment: payment.rows[0] ?? null, latest_offer: offer.rows[0] ?? null, tracking: tracking.rows };
}
// matchRole=false keeps legacy buyer/opener lookups (email without role filter).
async function userId(role: string, email?: string, matchRole = true): Promise<string | null> {
  const r = email ? await one<{ id: string }>(`SELECT id FROM users WHERE email = $1${matchRole ? ' AND role = $2' : ''}`, matchRole ? [email, role] : [email]) : await one<{ id: string }>('SELECT id FROM users WHERE role = $1 ORDER BY created_at ASC LIMIT 1', [role]);
  return (r?.id ?? null);
}
async function resolveOwnerStoreIds(ownerEmail?: string): Promise<{ ownerId: string; storeIds: string[] }> {
  const byEmail = ownerEmail ? await one<{ id: string }>("SELECT id FROM users WHERE email = $1 AND role = 'store_owner'", [ownerEmail]) : undefined;
  const owner = byEmail ?? await one<{ id: string }>("SELECT id FROM users WHERE role = 'store_owner' ORDER BY created_at ASC LIMIT 1");
  if (!owner) throw new Error('no store owners seeded');
  const s = await q('SELECT id FROM stores WHERE owner_id = $1', [owner.id]);
  return { ownerId: owner.id, storeIds: s.rows.map((x: { id: string }) => x.id) };
}
async function resolveRiderId(query: unknown): Promise<string | null> {
  const qry = (query ?? {}) as { riderEmail?: string; riderId?: string };
  return qry.riderId ?? userId('rider', qry.riderEmail);
}

// --- stub auth hook -----------------------------------------------------------
app.addHook('onRequest', async (req) => {
  const raw = req.headers['x-persona'];
  const p = String(Array.isArray(raw) ? raw[0] : (raw ?? '')).trim().toLowerCase();
  req.persona = (PERSONAS as string[]).includes(p) ? (p as Persona) : undefined;
});

// --- health + stores + menu ----------------------------------------------------
app.get('/health', async () => {
  const db = await q('SELECT count(*)::int AS stores FROM stores').catch((e: unknown) => ({ rows: [{ stores: -1, error: String(e) }] }));
  return { ok: true, service: 'kaoncdo-api', stores: (db as { rows: Array<{ stores: number }> }).rows[0].stores };
});
app.get('/api/stores', async () => {
  const { rows } = await q(`SELECT id, name, cuisine, image, rating, delivery_fee, is_open, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng FROM stores ORDER BY name`);
  return { stores: rows };
});
app.get<{ Params: { id: string } }>('/api/stores/:id/menu', async (req, reply) => {
  if (!ok(req, reply, undefined, req.params.id, 'store id')) return;
  const store = await one<{ id: string; name: string }>('SELECT id, name FROM stores WHERE id = $1', [req.params.id]);
  if (!store) return reply.code(404).send({ error: 'store_not_found' });
  const [cats, items, options, choices] = await Promise.all([
    q('SELECT * FROM menu_categories WHERE store_id = $1 ORDER BY sort ASC', [req.params.id]),
    q('SELECT * FROM menu_items WHERE store_id = $1 ORDER BY name ASC', [req.params.id]),
    q(`SELECT io.* FROM item_options io JOIN menu_items mi ON mi.id = io.item_id WHERE mi.store_id = $1`, [req.params.id]),
    q(`SELECT oc.* FROM option_choices oc JOIN item_options io ON io.id = oc.option_id JOIN menu_items mi ON mi.id = io.item_id WHERE mi.store_id = $1`, [req.params.id]),
  ]);
  const push = (m: Map<string, unknown[]>, k: string, v: unknown) => m.set(k, [...(m.get(k) ?? []), v]);
  const byOpt = new Map<string, unknown[]>(), byItem = new Map<string, unknown[]>(), byCat = new Map<string, unknown[]>();
  for (const c of choices.rows as Array<{ option_id: string } & Record<string, unknown>>) push(byOpt, c.option_id, c);
  for (const o of options.rows as Array<{ id: string; item_id: string } & Record<string, unknown>>) push(byItem, o.item_id, { ...o, choices: byOpt.get(o.id) ?? [] });
  const uncategorized: unknown[] = [];
  const catIds = new Set((cats.rows as Array<{ id: string }>).map((c) => c.id));
  for (const it of items.rows as Array<{ id: string; category_id: string | null } & Record<string, unknown>>) {
    const withOpts = { ...it, options: byItem.get(it.id) ?? [] };
    if (it.category_id && catIds.has(it.category_id)) push(byCat, it.category_id, withOpts); else uncategorized.push(withOpts);
  }
  return {
    store,
    categories: (cats.rows as Array<{ id: string; name: string }>).map((c) => ({ ...c, items: byCat.get(c.id) ?? [] })),
    uncategorized,
  };
});

// --- orders --------------------------------------------------------------------
const createOrderSchema = z.object({
  storeId: z.string().uuid(),
  items: z.array(z.object({ itemId: z.string().uuid(), qty: z.number().int().min(1).max(50), choices: z.array(z.string().uuid()).default([]) })).min(1),
  buyerLat: z.number().min(-90).max(90),
  buyerLng: z.number().min(-180).max(180),
  promoCode: z.string().trim().min(1).max(32).optional(),
  paymentMethod: z.string().trim().min(1).max(32).default('cod'),
  buyerEmail: z.string().email().optional(),
});
app.post('/api/orders', async (req, reply) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) return badBody(reply, parsed.error.issues);
  const input = parsed.data;
  const rawKey = req.headers['idempotency-key'];
  const idemKey = (Array.isArray(rawKey) ? rawKey[0] : rawKey)?.toString();
  if (idemKey && idempotency.has(idemKey)) {
    const existing = await getOrderFull(idempotency.get(idemKey) as string);
    if (existing) return { order: existing, deduped: true };
    idempotency.delete(idemKey);
  }
  const storeR = await q(`SELECT id, name, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng FROM stores WHERE id = $1`, [input.storeId]);
  if (storeR.rowCount === 0) return reply.code(404).send({ error: 'store_not_found' });
  const store = storeR.rows[0] as { id: string; name: string; lat: number; lng: number };
  const buyerId = await userId('buyer', input.buyerEmail, false);
  if (!buyerId) return reply.code(400).send({ error: 'buyer_not_found' });
  let subtotal = 0;
  const lines: Array<{ itemId: string; name: string; unitPrice: number; qty: number; options: unknown[]; lineTotal: number }> = [];
  for (const li of input.items) {
    const itR = await q('SELECT * FROM menu_items WHERE id = $1 AND store_id = $2', [li.itemId, input.storeId]);
    if (itR.rowCount === 0) return reply.code(400).send({ error: 'item_not_found', itemId: li.itemId });
    const item = itR.rows[0] as { id: string; name: string; price: number; is_available: boolean };
    if (!item.is_available) return reply.code(400).send({ error: 'item_unavailable', itemId: li.itemId });
    let delta = 0;
    const optJson: unknown[] = [];
    if (li.choices.length > 0) {
      const chR = await q(`SELECT oc.id, oc.name, oc.price_delta, io.item_id FROM option_choices oc JOIN item_options io ON io.id = oc.option_id WHERE oc.id = ANY($1)`, [li.choices]);
      if ((chR.rowCount ?? 0) !== li.choices.length) return reply.code(400).send({ error: 'invalid_choice' });
      for (const ch of chR.rows as Array<{ id: string; name: string; price_delta: number; item_id: string }>) {
        if (ch.item_id !== li.itemId) return reply.code(400).send({ error: 'invalid_choice', choiceId: ch.id });
        delta += ch.price_delta;
        optJson.push({ choiceId: ch.id, name: ch.name, price_delta: ch.price_delta });
      }
    }
    const unitPrice = Math.round(item.price + delta), lineTotal = Math.round(unitPrice * li.qty);
    subtotal += lineTotal;
    lines.push({ itemId: item.id, name: item.name, unitPrice, qty: li.qty, options: optJson, lineTotal });
  }
  subtotal = Math.round(subtotal);
  const km = haversineKm(store.lat, store.lng, input.buyerLat, input.buyerLng);
  const deliveryFee = deliveryFeeForKm(km), serviceFee = Math.round(subtotal * 0.05);
  let discount = 0, promoCode: string | null = null;
  if (input.promoCode) {
    const code = input.promoCode.toUpperCase();
    const promo = ((await q('SELECT * FROM promotions WHERE code = $1', [code])).rows[0] ?? null) as {
      kind: string; value: number; max_discount: number | null; min_order: number; active: boolean;
    } | null;
    if (!promo?.active) return reply.code(400).send({ error: 'invalid_promo' });
    if (subtotal < promo.min_order) return reply.code(400).send({ error: 'promo_min_order', min_order: promo.min_order, subtotal });
    discount = promo.kind === 'percent' ? Math.floor((subtotal * promo.value) / 100) : promo.kind === 'freeship' ? deliveryFee : promo.value;
    if (promo.max_discount != null && promo.kind !== 'flat') discount = Math.min(discount, promo.max_discount);
    discount = Math.max(0, Math.min(Math.round(discount), subtotal + deliveryFee + serviceFee));
    promoCode = code;
  }
  const total = Math.max(0, Math.round(subtotal + deliveryFee + serviceFee - discount));
  const pin = String(Math.floor(1000 + Math.random() * 9000));
  const oR = await q(
    `INSERT INTO orders (buyer_id, store_id, status, subtotal, delivery_fee, service_fee, discount, total, promo_code, payment_method, payment_status, pickup_pin, buyer_lat, buyer_lng, timeline) VALUES ($1,$2,'placed',$3,$4,$5,$6,$7,$8,$9,'paid',$10,$11,$12,$13::jsonb) RETURNING *`,
    [buyerId, input.storeId, subtotal, deliveryFee, serviceFee, discount, total, promoCode, input.paymentMethod, pin, input.buyerLat, input.buyerLng, JSON.stringify([{ at: new Date().toISOString(), status: 'placed' }])],
  );
  const order = oR.rows[0] as { id: string };
  for (const ln of lines)
    await q(`INSERT INTO order_items (order_id, item_id, name, unit_price, qty, options, line_total) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [order.id, ln.itemId, ln.name, ln.unitPrice, ln.qty, JSON.stringify(ln.options), ln.lineTotal]);
  await q(`INSERT INTO payments (order_id, method, amount, status, ref_code) VALUES ($1,$2,$3,'succeeded',$4)`, [order.id, input.paymentMethod, total, `MOCK-${Date.now().toString(36).toUpperCase()}`]);
  if (idemKey) idempotency.set(idemKey, order.id);
  emit('order.updated', { orderId: order.id, status: 'placed' }, order.id);
  void dispatchOrder(order.id);
  return reply.code(201).send({ order: await getOrderFull(order.id) });
});
app.get<{ Params: { id: string } }>('/api/orders/:id', async (req, reply) => {
  if (!ok(req, reply, undefined, req.params.id, 'order id')) return;
  const full = await getOrderFull(req.params.id);
  if (!full) return reply.code(404).send({ error: 'order_not_found' });
  return { order: full };
});
app.post<{ Params: { id: string } }>('/api/orders/:id/cancel', async (req, reply) => {
  if (!ok(req, reply, undefined, req.params.id, 'order id')) return;
  const o = await one<{ status: string }>('SELECT id, status FROM orders WHERE id = $1', [req.params.id]);
  if (!o) return reply.code(404).send({ error: 'order_not_found' });
  if (!CANCELLABLE.includes(o.status)) return reply.code(409).send({ error: 'too_late_to_cancel', status: o.status });
  await setOrderStatus(req.params.id, 'cancelled', 'cancelled by buyer');
  await refundPay(req.params.id);
  emit('order.updated', { orderId: req.params.id, status: 'cancelled' }, req.params.id);
  return { order: await getOrderFull(req.params.id) };
});
const paySchema = z.object({ method: z.string().trim().min(1).max(32) });
app.post<{ Params: { id: string } }>('/api/orders/:id/pay', async (req, reply) => {
  if (!ok(req, reply, undefined, req.params.id, 'order id')) return;
  const parsed = paySchema.safeParse(req.body);
  if (!parsed.success) return badBody(reply, parsed.error.issues);
  const order = await one<{ total: number; status: string }>('SELECT id, total, status FROM orders WHERE id = $1', [req.params.id]);
  if (!order) return reply.code(404).send({ error: 'order_not_found' });
  const ref = `MOCK-${Date.now().toString(36).toUpperCase()}`;
  await q(`INSERT INTO payments (order_id, method, amount, status, ref_code) VALUES ($1,$2,$3,'succeeded',$4) ON CONFLICT (order_id) DO UPDATE SET method = EXCLUDED.method, amount = EXCLUDED.amount, status = 'succeeded', ref_code = EXCLUDED.ref_code`, [req.params.id, parsed.data.method, order.total, ref]);
  await q("UPDATE orders SET payment_method = $2, payment_status = 'paid' WHERE id = $1", [req.params.id, parsed.data.method]);
  emit('order.updated', { orderId: req.params.id, status: order.status }, req.params.id);
  return { order: await getOrderFull(req.params.id) };
});
const reviewSchema = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().max(1000).optional().default(''), target: z.enum(['store', 'rider']) });
app.post<{ Params: { id: string } }>('/api/orders/:id/review', async (req, reply) => {
  if (!ok(req, reply, undefined, req.params.id, 'order id')) return;
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) return badBody(reply, parsed.error.issues);
  const order = await one<{ id: string; buyer_id: string; store_id: string }>('SELECT id, buyer_id, store_id FROM orders WHERE id = $1', [req.params.id]);
  if (!order) return reply.code(404).send({ error: 'order_not_found' });
  let storeId: string | null = order.store_id, riderId: string | null = null;
  if (parsed.data.target === 'rider') {
    const rider = await latestAcceptedRider(order.id);
    if (!rider) return reply.code(400).send({ error: 'no_rider_on_order' });
    storeId = null;
    riderId = rider.id;
  }
  const ins = await q(`INSERT INTO reviews (order_id, author_id, store_id, rider_id, rating, comment) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [order.id, order.buyer_id, storeId, riderId, parsed.data.rating, parsed.data.comment ?? '']);
  return reply.code(201).send({ review: ins.rows[0] });
});

// --- store owner (persona: store_owner) ----------------------------------------
app.get('/api/store/orders', async (req, reply) => {
  if (!ok(req, reply, ['store_owner'])) return;
  const qry = req.query as { status?: string; ownerEmail?: string };
  const { storeIds } = await resolveOwnerStoreIds(qry.ownerEmail);
  if (storeIds.length === 0) return { orders: [] };
  const params: unknown[] = [storeIds];
  let sql = `SELECT o.*, s.name AS store_name FROM orders o JOIN stores s ON s.id = o.store_id WHERE o.store_id = ANY($1)`;
  if (qry.status) {
    params.push(qry.status);
    sql += ` AND o.status = $${params.length}`;
  }
  const r = await q(`${sql} ORDER BY o.created_at DESC LIMIT 100`, params);
  return { orders: r.rows };
});
const storeActionSchema = z.object({ action: z.enum(['accept', 'reject', 'preparing', 'ready']) });
app.patch<{ Params: { id: string } }>('/api/store/orders/:id', async (req, reply) => {
  if (!ok(req, reply, ['store_owner'], req.params.id, 'order id')) return;
  const parsed = storeActionSchema.safeParse(req.body);
  if (!parsed.success) return badBody(reply, parsed.error.issues);
  const { storeIds } = await resolveOwnerStoreIds((req.query as { ownerEmail?: string }).ownerEmail);
  const order = await one<{ id: string; store_id: string; status: string }>('SELECT id, store_id, status FROM orders WHERE id = $1', [req.params.id]);
  if (!order) return reply.code(404).send({ error: 'order_not_found' });
  if (!storeIds.includes(order.store_id)) return reply.code(404).send({ error: 'order_not_found' });
  const next = STORE_NEXT[parsed.data.action]?.[order.status] ?? null;
  if (!next) return reply.code(409).send({ error: 'invalid_transition', from: order.status, action: parsed.data.action });
  await setOrderStatus(order.id, next, `store:${parsed.data.action}`);
  if (next === 'cancelled') await refundPay(order.id);
  emit('order.updated', { orderId: order.id, status: next }, order.id);
  if (next === 'store_accepted' || next === 'ready') void dispatchOrder(order.id);
  return { order: await getOrderFull(order.id) };
});
app.get('/api/store/stats', async (req, reply) => {
  if (!ok(req, reply, ['store_owner'])) return;
  const { ownerId, storeIds } = await resolveOwnerStoreIds((req.query as { ownerEmail?: string }).ownerEmail);
  if (storeIds.length === 0) return { ownerId, revenue_today: 0, active_count: 0, store_count: 0 };
  const [rev, act] = await Promise.all([
    q(`SELECT COALESCE(SUM(total),0)::int AS revenue FROM orders WHERE store_id = ANY($1) AND status <> 'cancelled' AND created_at >= date_trunc('day', now())`, [storeIds]),
    q(`SELECT count(*)::int AS active FROM orders WHERE store_id = ANY($1) AND status NOT IN ('delivered','cancelled')`, [storeIds]),
  ]);
  return { ownerId, store_count: storeIds.length, revenue_today: (rev.rows[0] as { revenue: number }).revenue, active_count: (act.rows[0] as { active: number }).active };
});
const menuItemPatchSchema = z.object({ is_available: z.boolean().optional(), price: z.number().int().min(0).optional() });
app.patch<{ Params: { id: string } }>('/api/menu-items/:id', async (req, reply) => {
  if (!ok(req, reply, ['store_owner'], req.params.id, 'menu item id')) return;
  const parsed = menuItemPatchSchema.safeParse(req.body);
  if (!parsed.success) return badBody(reply, parsed.error.issues);
  if (parsed.data.is_available === undefined && parsed.data.price === undefined)
    return reply.code(400).send({ error: 'nothing_to_update' });
  const { storeIds } = await resolveOwnerStoreIds((req.query as { ownerEmail?: string }).ownerEmail);
  const item = await one<{ store_id: string }>('SELECT * FROM menu_items WHERE id = $1', [req.params.id]);
  if (!item || !storeIds.includes(item.store_id)) return reply.code(404).send({ error: 'menu_item_not_found' });
  const sets: string[] = [], params: unknown[] = [];
  if (parsed.data.is_available !== undefined) {
    params.push(parsed.data.is_available);
    sets.push(`is_available = $${params.length}`);
  }
  if (parsed.data.price !== undefined) {
    params.push(parsed.data.price);
    sets.push(`price = $${params.length}`);
  }
  params.push(req.params.id);
  const upd = await q(`UPDATE menu_items SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
  return { item: upd.rows[0] };
});

// --- dispatch / rider (persona: rider) ------------------------------------------
app.post<{ Params: { id: string } }>('/api/offers/:id/accept', async (req, reply) => {
  if (!ok(req, reply, ['rider'], req.params.id, 'offer id')) return;
  const offer = await one<{ id: string; order_id: string; rider_id: string; status: string; expires_at: string | null }>('SELECT * FROM offers WHERE id = $1', [req.params.id]);
  if (!offer) return reply.code(404).send({ error: 'offer_not_found' });
  if (offer.status !== 'offered') return reply.code(409).send({ error: 'offer_not_live', status: offer.status });
  if (offer.expires_at && new Date(offer.expires_at).getTime() < Date.now()) {
    await q("UPDATE offers SET status = 'expired' WHERE id = $1 AND status = 'offered'", [offer.id]);
    void dispatchOrder(offer.order_id);
    return reply.code(410).send({ error: 'offer_expired' });
  }
  const o = await q('SELECT id, status FROM orders WHERE id = $1', [offer.order_id]);
  const status = (o.rows[0] as { status: string }).status;
  if (NOT_ASSIGNABLE.includes(status)) return reply.code(409).send({ error: 'order_not_assignable', status });
  await q("UPDATE offers SET status = 'accepted' WHERE id = $1", [offer.id]);
  await q("UPDATE offers SET status = 'expired' WHERE order_id = $1 AND status = 'offered' AND id <> $2", [offer.order_id, offer.id]);
  await setOrderStatus(offer.order_id, 'rider_assigned', `rider accepted offer ${offer.id}`);
  await q("UPDATE rider_profiles SET status = 'busy', updated_at = now() WHERE user_id = $1", [offer.rider_id]);
  emit('offer.created', { ...offer, status: 'accepted' }, offer.order_id);
  emit('order.updated', { orderId: offer.order_id, status: 'rider_assigned' }, offer.order_id);
  return { order: await getOrderFull(offer.order_id) };
});
app.post<{ Params: { id: string } }>('/api/offers/:id/decline', async (req, reply) => {
  if (!ok(req, reply, ['rider'], req.params.id, 'offer id')) return;
  const offer = await one<{ id: string; order_id: string; status: string }>('SELECT * FROM offers WHERE id = $1', [req.params.id]);
  if (!offer) return reply.code(404).send({ error: 'offer_not_found' });
  if (offer.status !== 'offered') return reply.code(409).send({ error: 'offer_not_live', status: offer.status });
  await q("UPDATE offers SET status = 'declined' WHERE id = $1", [offer.id]);
  const o = await q('SELECT status FROM orders WHERE id = $1', [offer.order_id]);
  if ((o.rowCount ?? 0) > 0) emit('order.updated', { orderId: offer.order_id, status: (o.rows[0] as { status: string }).status }, offer.order_id);
  void dispatchOrder(offer.order_id);
  return { ok: true, offer_id: offer.id, status: 'declined' };
});
const presenceSchema = z.object({ status: z.enum(['offline', 'online', 'busy']), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), riderId: z.string().uuid().optional(), riderEmail: z.string().email().optional() });
app.post('/api/rider/presence', async (req, reply) => {
  if (!ok(req, reply, ['rider'])) return;
  const parsed = presenceSchema.safeParse(req.body);
  if (!parsed.success) return badBody(reply, parsed.error.issues);
  const qry = req.query as { riderEmail?: string };
  const riderId = parsed.data.riderId ?? (await userId('rider', parsed.data.riderEmail ?? qry.riderEmail));
  if (!riderId) return reply.code(404).send({ error: 'rider_not_found' });
  await q(`INSERT INTO rider_profiles (user_id, status, last_location, updated_at) VALUES ($1, $2, ST_GeogFromText('SRID=4326;POINT(' || $3 || ' ' || $4 || ')'), now()) ON CONFLICT (user_id) DO UPDATE SET status = EXCLUDED.status, last_location = EXCLUDED.last_location, updated_at = now()`, [riderId, parsed.data.status, String(parsed.data.lng), String(parsed.data.lat)]);
  const cur = await q(`SELECT u.id, u.name, rp.status, rp.vehicle, ST_Y(rp.last_location::geometry) AS lat, ST_X(rp.last_location::geometry) AS lng FROM rider_profiles rp JOIN users u ON u.id = rp.user_id WHERE u.id = $1`, [riderId]);
  return { rider: cur.rows[0] };
});
const pickupSchema = z.object({ pin: z.string().min(4).max(8) });
app.post<{ Params: { id: string } }>('/api/orders/:id/pickup', async (req, reply) => {
  if (!ok(req, reply, ['rider'], req.params.id, 'order id')) return;
  const parsed = pickupSchema.safeParse(req.body);
  if (!parsed.success) return badBody(reply, parsed.error.issues);
  const order = await one<{ id: string; status: string; pickup_pin: string | null }>('SELECT id, status, pickup_pin FROM orders WHERE id = $1', [req.params.id]);
  if (!order) return reply.code(404).send({ error: 'order_not_found' });
  if (!PICKABLE.includes(order.status)) return reply.code(409).send({ error: 'not_ready_for_pickup', status: order.status });
  if ((order.pickup_pin ?? '') !== parsed.data.pin) return reply.code(400).send({ error: 'bad_pin' });
  await setOrderStatus(order.id, 'picked_up', 'picked up by rider');
  emit('order.updated', { orderId: order.id, status: 'picked_up' }, order.id);
  return { order: await getOrderFull(order.id) };
});
app.post<{ Params: { id: string } }>('/api/orders/:id/deliver', async (req, reply) => {
  if (!ok(req, reply, ['rider'], req.params.id, 'order id')) return;
  const order = await one<{ id: string; status: string }>('SELECT id, status FROM orders WHERE id = $1', [req.params.id]);
  if (!order) return reply.code(404).send({ error: 'order_not_found' });
  if (!DELIVERABLE.includes(order.status)) return reply.code(409).send({ error: 'not_out_for_delivery', status: order.status });
  await setOrderStatus(order.id, 'delivered', 'delivered to buyer');
  const rider = await latestAcceptedRider(order.id);
  if (rider) await q("UPDATE rider_profiles SET status = 'online', updated_at = now() WHERE user_id = $1", [rider.id]);
  emit('order.updated', { orderId: order.id, status: 'delivered' }, order.id);
  return { order: await getOrderFull(order.id) };
});
const trackingSchema = z.object({ orderId: z.string().uuid(), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), heading: z.number().min(0).max(360).nullable().optional() });
app.post('/api/tracking', async (req, reply) => {
  if (!ok(req, reply, ['rider'])) return;
  const parsed = trackingSchema.safeParse(req.body);
  if (!parsed.success) return badBody(reply, parsed.error.issues);
  if (!(await one('SELECT id FROM orders WHERE id = $1', [parsed.data.orderId]))) return reply.code(404).send({ error: 'order_not_found' });
  const rider = await latestAcceptedRider(parsed.data.orderId);
  const ins = await q(`INSERT INTO delivery_tracking (order_id, rider_id, geom, heading) VALUES ($1, $2, ST_GeogFromText('SRID=4326;POINT(' || $3 || ' ' || $4 || ')'), $5) RETURNING id, at`, [parsed.data.orderId, rider?.id ?? null, String(parsed.data.lng), String(parsed.data.lat), parsed.data.heading ?? null]);
  emit('tracking.point', { orderId: parsed.data.orderId, lat: parsed.data.lat, lng: parsed.data.lng, heading: parsed.data.heading ?? null }, parsed.data.orderId);
  return reply.code(201).send({ point: { ...ins.rows[0], ...parsed.data } });
});
app.get<{ Params: { id: string } }>('/api/orders/:id/tracking', async (req, reply) => {
  if (!ok(req, reply, undefined, req.params.id, 'order id')) return;
  if (!(await one('SELECT id FROM orders WHERE id = $1', [req.params.id]))) return reply.code(404).send({ error: 'order_not_found' });
  const r = await q(`SELECT ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng, heading, speed, at FROM delivery_tracking WHERE order_id = $1 ORDER BY at ASC LIMIT 500`, [req.params.id]);
  return { orderId: req.params.id, points: r.rows };
});
app.get('/api/rider/offers', async (req, reply) => {
  if (!ok(req, reply, ['rider'])) return;
  const riderId = await resolveRiderId(req.query);
  if (!riderId) return reply.code(404).send({ error: 'rider_not_found' });
  const r = await q(
    `SELECT ofr.id, ofr.order_id, ofr.status, ofr.expires_at, o.total, o.created_at, s.name AS store_name, s.delivery_fee FROM offers ofr JOIN orders o ON o.id = ofr.order_id JOIN stores s ON s.id = o.store_id WHERE ofr.rider_id = $1 AND ofr.status = 'offered' AND ofr.expires_at > now() ORDER BY ofr.created_at DESC`, [riderId]);
  return { riderId, offers: r.rows };
});
app.get('/api/rider/active', async (req, reply) => {
  if (!ok(req, reply, ['rider'])) return;
  const riderId = await resolveRiderId(req.query);
  if (!riderId) return reply.code(404).send({ error: 'rider_not_found' });
  const r = await q(
    `SELECT o.id FROM orders o JOIN offers ofr ON ofr.order_id = o.id WHERE ofr.rider_id = $1 AND ofr.status = 'accepted' AND o.status IN ('rider_assigned','picked_up','delivering') ORDER BY o.created_at DESC LIMIT 1`, [riderId]);
  if ((r.rowCount ?? 0) === 0) return { riderId, order: null };
  return { riderId, order: await getOrderFull((r.rows[0] as { id: string }).id) };
});

// --- ops (persona: operator) -----------------------------------------------------
app.get('/api/ops/live', async (req, reply) => {
  if (!ok(req, reply, ['operator', 'support'])) return;
  const [riders, orders] = await Promise.all([
    q(`SELECT u.id, u.name, rp.status, rp.vehicle, ST_Y(rp.last_location::geometry) AS lat, ST_X(rp.last_location::geometry) AS lng, rp.updated_at FROM rider_profiles rp JOIN users u ON u.id = rp.user_id WHERE rp.status IN ('online','busy') ORDER BY u.name`),
    q(`SELECT o.id, o.status, o.total, o.created_at, s.name AS store_name, u.name AS buyer_name FROM orders o JOIN stores s ON s.id = o.store_id JOIN users u ON u.id = o.buyer_id WHERE o.status NOT IN ('delivered','cancelled') ORDER BY o.created_at DESC LIMIT 100`),
  ]);
  return { riders: riders.rows, active_orders: orders.rows };
});
const assignSchema = z.object({ orderId: z.string().uuid(), riderId: z.string().uuid() });
app.post('/api/ops/assign', async (req, reply) => {
  if (!ok(req, reply, ['operator', 'support'])) return;
  const parsed = assignSchema.safeParse(req.body);
  if (!parsed.success) return badBody(reply, parsed.error.issues);
  const o = await one<{ status: string }>('SELECT id, status FROM orders WHERE id = $1', [parsed.data.orderId]);
  if (!o) return reply.code(404).send({ error: 'order_not_found' });
  if (CLOSED.includes(o.status)) return reply.code(409).send({ error: 'order_closed', status: o.status });
  const u = await one<{ name: string }>("SELECT id, name FROM users WHERE id = $1 AND role = 'rider'", [parsed.data.riderId]);
  if (!u) return reply.code(404).send({ error: 'rider_not_found' });
  await q("UPDATE offers SET status = 'expired' WHERE order_id = $1 AND status = 'offered'", [parsed.data.orderId]);
  const off = await q(`INSERT INTO offers (order_id, rider_id, status) VALUES ($1,$2,'accepted') RETURNING *`, [parsed.data.orderId, parsed.data.riderId]);
  await setOrderStatus(parsed.data.orderId, 'rider_assigned', `force-assigned to ${u.name} by ops`);
  await q("UPDATE rider_profiles SET status = 'busy', updated_at = now() WHERE user_id = $1", [parsed.data.riderId]);
  emit('offer.created', off.rows[0], parsed.data.orderId);
  emit('order.updated', { orderId: parsed.data.orderId, status: 'rider_assigned' }, parsed.data.orderId);
  return { order: await getOrderFull(parsed.data.orderId) };
});
const broadcastSchema = z.object({ message: z.string().trim().min(1).max(500) });
app.post('/api/ops/broadcast', async (req, reply) => {
  if (!ok(req, reply, ['operator'])) return;
  const parsed = broadcastSchema.safeParse(req.body);
  if (!parsed.success) return badBody(reply, parsed.error.issues);
  emit('ops.broadcast', { message: parsed.data.message, at: new Date().toISOString() });
  return { ok: true, message: parsed.data.message };
});
app.get('/api/ops/promos', async (req, reply) => {
  if (!ok(req, reply, ['operator'])) return;
  const r = await q('SELECT * FROM promotions ORDER BY code ASC');
  return { promos: r.rows };
});
const promoCreateSchema = z.object({ code: z.string().trim().min(1).max(32), kind: z.enum(['percent', 'flat', 'freeship']), value: z.number().int().min(0), max_discount: z.number().int().min(0).nullable().optional(), min_order: z.number().int().min(0).default(0), active: z.boolean().default(true) });
app.post('/api/ops/promos', async (req, reply) => {
  if (!ok(req, reply, ['operator'])) return;
  const parsed = promoCreateSchema.safeParse(req.body);
  if (!parsed.success) return badBody(reply, parsed.error.issues);
  const code = parsed.data.code.toUpperCase();
  if (await one('SELECT code FROM promotions WHERE code = $1', [code])) return reply.code(409).send({ error: 'promo_exists' });
  const ins = await q(`INSERT INTO promotions (code, kind, value, max_discount, min_order, active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [code, parsed.data.kind, parsed.data.value, parsed.data.max_discount ?? null, parsed.data.min_order, parsed.data.active]);
  return reply.code(201).send({ promo: ins.rows[0] });
});

// --- support (open stub; persona optional) ----------------------------------------
app.get('/api/tickets', async (req) => {
  const qry = req.query as { status?: string };
  const params: unknown[] = [];
  let sql = `SELECT t.*, u.name AS opener_name, u.email AS opener_email, (SELECT count(*)::int FROM ticket_messages m WHERE m.ticket_id = t.id) AS message_count FROM tickets t JOIN users u ON u.id = t.opener_id`;
  if (qry.status) {
    params.push(qry.status);
    sql += ` WHERE t.status = $${params.length}`;
  }
  const r = await q(`${sql} ORDER BY t.created_at DESC LIMIT 100`, params);
  return { tickets: r.rows };
});
const ticketCreateSchema = z.object({ orderId: z.string().uuid().optional(), subject: z.string().trim().min(1).max(300), priority: z.enum(['low', 'normal', 'high']).default('normal'), openerEmail: z.string().email().optional() });
app.post('/api/tickets', async (req, reply) => {
  const parsed = ticketCreateSchema.safeParse(req.body);
  if (!parsed.success) return badBody(reply, parsed.error.issues);
  if (parsed.data.orderId && (await q('SELECT id FROM orders WHERE id = $1', [parsed.data.orderId])).rowCount === 0)
    return reply.code(404).send({ error: 'order_not_found' });
  const openerId = await userId('buyer', parsed.data.openerEmail, false);
  if (!openerId) return reply.code(400).send({ error: 'opener_not_found' });
  const ins = await q(`INSERT INTO tickets (order_id, opener_id, subject, priority) VALUES ($1,$2,$3,$4) RETURNING *`, [parsed.data.orderId ?? null, openerId, parsed.data.subject, parsed.data.priority]);
  emit('ticket.updated', ins.rows[0]);
  return reply.code(201).send({ ticket: ins.rows[0] });
});
app.get<{ Params: { id: string } }>('/api/tickets/:id', async (req, reply) => {
  if (!ok(req, reply, undefined, req.params.id, 'ticket id')) return;
  const t = await q('SELECT * FROM tickets WHERE id = $1', [req.params.id]);
  if (t.rowCount === 0) return reply.code(404).send({ error: 'ticket_not_found' });
  const m = await q('SELECT * FROM ticket_messages WHERE ticket_id = $1 ORDER BY created_at ASC', [req.params.id]);
  return { ticket: t.rows[0], messages: m.rows };
});
const ticketMsgSchema = z.object({ body: z.string().trim().min(1).max(2000), sender_role: z.string().trim().min(1).max(32).default('support') });
app.post<{ Params: { id: string } }>('/api/tickets/:id/messages', async (req, reply) => {
  if (!ok(req, reply, undefined, req.params.id, 'ticket id')) return;
  const parsed = ticketMsgSchema.safeParse(req.body);
  if (!parsed.success) return badBody(reply, parsed.error.issues);
  if ((await q('SELECT * FROM tickets WHERE id = $1', [req.params.id])).rowCount === 0)
    return reply.code(404).send({ error: 'ticket_not_found' });
  const ins = await q(`INSERT INTO ticket_messages (ticket_id, sender_role, body) VALUES ($1,$2,$3) RETURNING *`, [req.params.id, parsed.data.sender_role, parsed.data.body]);
  emit('ticket.updated', { ticket_id: req.params.id, message: ins.rows[0] });
  return reply.code(201).send({ message: ins.rows[0] });
});
app.post<{ Params: { id: string } }>('/api/tickets/:id/resolve', async (req, reply) => {
  if (!ok(req, reply, undefined, req.params.id, 'ticket id')) return;
  const upd = await q("UPDATE tickets SET status = 'resolved' WHERE id = $1 RETURNING *", [req.params.id]);
  if (upd.rowCount === 0) return reply.code(404).send({ error: 'ticket_not_found' });
  emit('ticket.updated', upd.rows[0]);
  return { ticket: upd.rows[0] };
});
app.post<{ Params: { id: string } }>('/api/tickets/:id/refund', async (req, reply) => {
  if (!ok(req, reply, undefined, req.params.id, 'ticket id')) return;
  const ticket = await one<{ id: string; order_id: string | null }>('SELECT * FROM tickets WHERE id = $1', [req.params.id]);
  if (!ticket) return reply.code(404).send({ error: 'ticket_not_found' });
  if (!ticket.order_id) return reply.code(400).send({ error: 'ticket_has_no_order' });
  await refundPay(ticket.order_id);
  const o = await q('SELECT status FROM orders WHERE id = $1', [ticket.order_id]);
  const status = (o.rows[0] as { status: string }).status;
  await appendTimeline(ticket.order_id, status, `refunded via support ticket ${ticket.id}`);
  emit('order.updated', { orderId: ticket.order_id, status }, ticket.order_id);
  emit('ticket.updated', { ticket_id: ticket.id, refunded_order: ticket.order_id });
  return { ok: true, order: await getOrderFull(ticket.order_id) };
});

// --- boot -------------------------------------------------------------------------
await maybeInitRedis();
const port = Number(process.env.API_PORT ?? 3001);
await app.listen({ port, host: '0.0.0.0' });
io = new SocketIOServer(app.server, { cors: { origin: true } });
io.on('connection', (socket) => {
  socket.on('join-order', (payload: unknown) => {
    const orderId = typeof payload === 'string' ? payload : (payload as { orderId?: string } | null)?.orderId;
    if (orderId) void socket.join(`order:${orderId}`);
  });
  socket.on('join-ops', () => { void socket.join('city.ops'); });
});
app.log.info(`kaoncdo-api listening on :${port} (+socket.io)`);
