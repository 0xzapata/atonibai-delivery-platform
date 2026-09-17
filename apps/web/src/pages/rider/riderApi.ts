// Rider API helpers over src/lib/api.ts (forces `x-persona: rider`).
// Identity lives in one place: RIDER_EMAIL.
import { api, type StoresPayload } from '../../lib/api';

export const RIDER_EMAIL = 'ramon@example.com';
export const ONLINE_LAT = 8.4852;
export const ONLINE_LNG = 124.6472;

const H: HeadersInit = { 'x-persona': 'rider' };

export const riderGet = <T>(path: string): Promise<T> => api<T>(path, { method: 'GET', headers: H });
export const riderPost = <T>(path: string, body?: Record<string, unknown>): Promise<T> =>
  api<T>(path, { method: 'POST', headers: H, body: body === undefined ? undefined : JSON.stringify(body) });

export const withRiderEmail = (path: string): string =>
  `${path}${path.includes('?') ? '&' : '?'}riderEmail=${encodeURIComponent(RIDER_EMAIL)}`;

const rec = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
const num = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};
const str = (v: unknown): string | null => {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return null;
};

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
  const r = rec(rec(payload).rider ?? payload);
  if (r.id === undefined && r.name === undefined) return null;
  return {
    id: String(r.id ?? ''),
    name: str(r.name),
    status: str(r.status) ?? 'offline',
    vehicle: str(r.vehicle),
    lat: num(r.lat),
    lng: num(r.lng),
  };
}

export const postPresence = (status: RiderStatus): Promise<RiderProfile | null> =>
  riderPost<unknown>(withRiderEmail('/api/rider/presence'), {
    status,
    lat: ONLINE_LAT,
    lng: ONLINE_LNG,
  }).then(toRiderProfile);

export interface RiderOffer {
  id: string;
  order_id: string;
  total: number | null;
  store_name: string;
  expires_at: string | null;
}

const toOffer = (raw: unknown): RiderOffer | null => {
  const r = rec(raw);
  const id = str(r.id);
  if (!id) return null;
  return {
    id,
    order_id: str(r.order_id ?? r.orderId) ?? '',
    total: num(r.total),
    store_name: str(r.store_name ?? r.storeName ?? r.store) ?? 'Store',
    expires_at: str(r.expires_at ?? r.expiresAt),
  };
};

export async function fetchOffers(): Promise<RiderOffer[]> {
  const root = rec(await riderGet<unknown>(withRiderEmail('/api/rider/offers')));
  const raw = root.offers ?? root.data ?? [];
  return Array.isArray(raw) ? raw.map(toOffer).filter((o): o is RiderOffer => o !== null) : [];
}

const offerAction = (id: string, verb: 'accept' | 'decline'): Promise<unknown> =>
  riderPost<unknown>(withRiderEmail(`/api/offers/${encodeURIComponent(id)}/${verb}`), {});
export const acceptOffer = (id: string): Promise<unknown> => offerAction(id, 'accept');
export const declineOffer = (id: string): Promise<unknown> => offerAction(id, 'decline');

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

export function toActiveOrder(payload: unknown): ActiveOrder | null {
  const root = rec(payload);
  if (root.order === null) return null;
  const src = rec(root.order ?? payload);
  if (src.id === undefined || src.id === null || src.id === '') return null;
  const storeRaw = rec(src.store ?? root.store ?? {});
  const payRaw = rec(src.payment ?? root.payment ?? {});
  const rawItems = src.items ?? root.items;
  const items: ActiveItem[] = Array.isArray(rawItems)
    ? rawItems.map((it) => {
        const r = rec(it);
        return {
          name: str(r.name ?? r.item_name) ?? 'Item',
          qty: num(r.qty ?? r.quantity) ?? 1,
          price: num(r.unit_price ?? r.price ?? r.line_total),
        };
      })
    : [];
  const hasStore = storeRaw.id !== undefined || storeRaw.name !== undefined;
  return {
    id: String(src.id),
    status: str(src.status) ?? 'rider_assigned',
    total: num(src.total),
    pickup_pin: str(src.pickup_pin ?? src.pickupPin),
    eta_min: num(src.eta_min ?? src.etaMin),
    buyer_lat: num(src.buyer_lat ?? src.buyerLat),
    buyer_lng: num(src.buyer_lng ?? src.buyerLng),
    timeline: src.timeline ?? [],
    payment_method:
      str(payRaw.method ?? payRaw.payment_method) ?? str(src.payment_method ?? src.paymentMethod),
    store: hasStore
      ? { name: str(storeRaw.name) ?? 'Store', lat: num(storeRaw.lat), lng: num(storeRaw.lng) }
      : null,
    items,
  };
}

export const fetchActiveOrder = (): Promise<ActiveOrder | null> =>
  riderGet<unknown>(withRiderEmail('/api/rider/active')).then(toActiveOrder);

export const pickupOrder = (id: string, pin: string): Promise<unknown> =>
  riderPost<unknown>(withRiderEmail(`/api/orders/${encodeURIComponent(id)}/pickup`), { pin });
export const deliverOrder = (id: string): Promise<unknown> =>
  riderPost<unknown>(withRiderEmail(`/api/orders/${encodeURIComponent(id)}/deliver`), {});
export const postTracking = (p: {
  orderId: string;
  lat: number;
  lng: number;
  heading: number | null;
}): Promise<unknown> =>
  riderPost<unknown>('/api/tracking', { orderId: p.orderId, lat: p.lat, lng: p.lng, heading: p.heading });

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
    const r = rec(s);
    return { name: str(r.name) ?? '', lat: num(r.lat), lng: num(r.lng) };
  });
}

export function matchStoreCoords(
  stores: StoreCoord[],
  name: string | null,
): { lat: number; lng: number } | null {
  if (!name) return null;
  const want = name.trim().toLowerCase();
  const hit = stores.find((s) => s.name.trim().toLowerCase() === want);
  return hit && hit.lat !== null && hit.lng !== null ? { lat: hit.lat, lng: hit.lng } : null;
}

export function peso(n: number): string {
  const r = Math.round(n * 100) / 100;
  return `\u20B1${r.toLocaleString('en-PH', {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(r) ? 0 : 2,
  })}`;
}

export const shortId = (id: string): string => (id.length > 8 ? `${id.slice(0, 8)}\u2026` : id);
