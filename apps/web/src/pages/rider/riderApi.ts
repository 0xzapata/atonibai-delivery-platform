// Rider API helpers. Reuses src/lib/api.ts (api/apiGet) and forces the
// `x-persona: rider` stub-auth header (api() keeps an explicit header).
// Rider identity lives in exactly one place: RIDER_EMAIL.
import { api, type StoresPayload } from '../../lib/api';

/** Default rider identity — change in one place (sent as ?riderEmail=). */
export const RIDER_EMAIL = 'ramon@example.com';

/** Fixed CDO coords near Centrio Ayala (POC has no GPS feed). */
export const ONLINE_LAT = 8.4852;
export const ONLINE_LNG = 124.6472;

const RIDER_PERSONA_HEADERS: HeadersInit = { 'x-persona': 'rider' };

export function riderGet<T>(path: string): Promise<T> {
  return api<T>(path, { method: 'GET', headers: RIDER_PERSONA_HEADERS });
}

export function riderPost<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  return api<T>(path, {
    method: 'POST',
    headers: RIDER_PERSONA_HEADERS,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function withRiderEmail(path: string): string {
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}riderEmail=${encodeURIComponent(RIDER_EMAIL)}`;
}

// ---------- tiny defensive accessors (backend lands in parallel) ----------

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null) return value as Record<string, unknown>;
  return {};
}

function asNum(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asStr(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

// ---------- presence ----------

export type RiderStatus = 'online' | 'offline' | 'busy';

export interface RiderProfile {
  id: string;
  name: string | null;
  status: string;
  vehicle: string | null;
  lat: number | null;
  lng: number | null;
}

export function toRiderProfile(payload: unknown): RiderProfile | null {
  const root = asRecord(payload);
  const r = asRecord(root.rider ?? payload);
  if (r.id === undefined && r.name === undefined) return null;
  return {
    id: String(r.id ?? ''),
    name: asStr(r.name),
    status: asStr(r.status) ?? 'offline',
    vehicle: asStr(r.vehicle),
    lat: asNum(r.lat),
    lng: asNum(r.lng),
  };
}

export async function postPresence(status: RiderStatus): Promise<RiderProfile | null> {
  const data = await riderPost<unknown>(withRiderEmail('/api/rider/presence'), {
    status,
    lat: ONLINE_LAT,
    lng: ONLINE_LNG,
  });
  return toRiderProfile(data);
}

// ---------- offers ----------

export interface RiderOffer {
  id: string;
  order_id: string;
  total: number | null;
  store_name: string;
  expires_at: string | null;
}

function toOffer(raw: unknown): RiderOffer | null {
  const r = asRecord(raw);
  const id = asStr(r.id);
  if (!id) return null;
  return {
    id,
    order_id: asStr(r.order_id ?? r.orderId) ?? '',
    total: asNum(r.total),
    store_name: asStr(r.store_name ?? r.storeName ?? r.store) ?? 'Store',
    expires_at: asStr(r.expires_at ?? r.expiresAt),
  };
}

export async function fetchOffers(): Promise<RiderOffer[]> {
  const data = await riderGet<unknown>(withRiderEmail('/api/rider/offers'));
  const root = asRecord(data);
  const raw = root.offers ?? root.data ?? [];
  if (!Array.isArray(raw)) return [];
  return raw.map(toOffer).filter((o): o is RiderOffer => o !== null);
}

export function acceptOffer(id: string): Promise<unknown> {
  return riderPost<unknown>(withRiderEmail(`/api/offers/${encodeURIComponent(id)}/accept`), {});
}

export function declineOffer(id: string): Promise<unknown> {
  return riderPost<unknown>(withRiderEmail(`/api/offers/${encodeURIComponent(id)}/decline`), {});
}

// ---------- active delivery ----------

export interface ActiveItem {
  name: string;
  qty: number;
  price: number | null;
}

export interface ActiveStore {
  name: string;
  lat: number | null;
  lng: number | null;
}

export interface ActiveOrder {
  id: string;
  status: string;
  total: number | null;
  pickup_pin: string | null;
  eta_min: number | null;
  buyer_lat: number | null;
  buyer_lng: number | null;
  timeline: unknown;
  payment_method: string | null;
  store: ActiveStore | null;
  items: ActiveItem[];
}

/**
 * Accept both { order: {...} } and flat order payloads (+ camelCase aliases).
 * Full-order detail (items/store/payment/tracking) rides nested inside the
 * order object; fall back to top-level keys when present.
 */
export function toActiveOrder(payload: unknown): ActiveOrder | null {
  const root = asRecord(payload);
  if (root.order === null) return null;
  const src = asRecord(root.order ?? payload);
  if (src.id === undefined || src.id === null || src.id === '') return null;

  const storeRaw = asRecord(src.store ?? root.store ?? {});
  const hasStore = storeRaw.id !== undefined || storeRaw.name !== undefined;
  const paymentRaw = asRecord(src.payment ?? root.payment ?? {});

  const itemsRaw = src.items ?? root.items;
  const items: ActiveItem[] = Array.isArray(itemsRaw)
    ? itemsRaw.map((it) => {
        const r = asRecord(it);
        return {
          name: asStr(r.name ?? r.item_name) ?? 'Item',
          qty: asNum(r.qty ?? r.quantity) ?? 1,
          price: asNum(r.unit_price ?? r.price ?? r.line_total),
        };
      })
    : [];

  return {
    id: String(src.id),
    status: asStr(src.status) ?? 'rider_assigned',
    total: asNum(src.total),
    pickup_pin: asStr(src.pickup_pin ?? src.pickupPin),
    eta_min: asNum(src.eta_min ?? src.etaMin),
    buyer_lat: asNum(src.buyer_lat ?? src.buyerLat),
    buyer_lng: asNum(src.buyer_lng ?? src.buyerLng),
    timeline: src.timeline ?? [],
    payment_method:
      asStr(paymentRaw.method ?? paymentRaw.payment_method) ??
      asStr(src.payment_method ?? src.paymentMethod),
    store: hasStore
      ? {
          name: asStr(storeRaw.name) ?? 'Store',
          lat: asNum(storeRaw.lat),
          lng: asNum(storeRaw.lng),
        }
      : null,
    items,
  };
}

export async function fetchActiveOrder(): Promise<ActiveOrder | null> {
  const data = await riderGet<unknown>(withRiderEmail('/api/rider/active'));
  return toActiveOrder(data);
}

// ---------- fulfilment actions (exact contract shapes) ----------

export function pickupOrder(id: string, pin: string): Promise<unknown> {
  return riderPost<unknown>(withRiderEmail(`/api/orders/${encodeURIComponent(id)}/pickup`), { pin });
}

export function deliverOrder(id: string): Promise<unknown> {
  return riderPost<unknown>(withRiderEmail(`/api/orders/${encodeURIComponent(id)}/deliver`), {});
}

export function postTracking(point: {
  orderId: string;
  lat: number;
  lng: number;
  heading: number | null;
}): Promise<unknown> {
  return riderPost<unknown>('/api/tracking', {
    orderId: point.orderId,
    lat: point.lat,
    lng: point.lng,
    heading: point.heading,
  });
}

// ---------- stores (coords fallback: order payload omits store lat/lng) ----------

export interface StoreCoord {
  name: string;
  lat: number | null;
  lng: number | null;
}

export async function fetchStoreCoords(): Promise<StoreCoord[]> {
  const data = await riderGet<StoresPayload>('/api/stores').catch(() => null);
  if (!data) return [];
  const list = Array.isArray(data) ? data : data.stores;
  if (!Array.isArray(list)) return [];
  return list.map((s) => {
    const r = asRecord(s);
    return {
      name: asStr(r.name) ?? '',
      lat: asNum(r.lat),
      lng: asNum(r.lng),
    };
  });
}

/** Match a store by name (case-insensitive); returns coords or null. */
export function matchStoreCoords(
  stores: StoreCoord[],
  name: string | null,
): { lat: number; lng: number } | null {
  if (!name) return null;
  const want = name.trim().toLowerCase();
  const hit = stores.find((s) => s.name.trim().toLowerCase() === want);
  if (hit && hit.lat !== null && hit.lng !== null) return { lat: hit.lat, lng: hit.lng };
  return null;
}

// ---------- formatting ----------

export function peso(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return `\u20B1${rounded.toLocaleString('en-PH', {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
  })}`;
}

export function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}\u2026` : id;
}
