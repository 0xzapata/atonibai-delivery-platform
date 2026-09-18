// Ops API helpers over src/lib/api.ts (forces `x-persona: operator`).
import { api, apiGet } from '../../lib/api';

export interface LiveRider {
  id: string;
  name: string;
  status: string;
  vehicle?: string | null;
  lat: number | null;
  lng: number | null;
}
export interface LiveOrder {
  id: string;
  status: string;
  total: number | null;
  store_name: string | null;
  buyer_name: string | null;
}
export interface LivePayload {
  riders: LiveRider[];
  active_orders: LiveOrder[];
}
export interface Promo {
  id?: string | number;
  code: string;
  kind: string;
  value: number;
  max_discount?: number | null;
  min_order?: number | null;
  active?: boolean;
}
export interface PromoCreate {
  code: string;
  kind: 'percent' | 'flat' | 'freeship';
  value: number;
  max_discount?: number | null;
  min_order: number;
  active: boolean;
}
export interface StorePin {
  id: string | number;
  name: string;
  lat: number | null;
  lng: number | null;
}

const H: HeadersInit = { 'x-persona': 'operator' };
const get = <T>(path: string): Promise<T> => api<T>(path, { method: 'GET', headers: H });
const post = (path: string, body: unknown): Promise<unknown> =>
  api<unknown>(path, { method: 'POST', headers: H, body: JSON.stringify(body) });

const rec = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
const num = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};
const str = (v: unknown): string | null => {
  if (typeof v === 'string' && v !== '') return v;
  if (typeof v === 'number') return String(v);
  return null;
};
const listOf = (payload: unknown, key: string): unknown[] => {
  const root = rec(payload);
  if (Array.isArray(payload)) return payload;
  const v = root[key];
  return Array.isArray(v) ? v : [];
};

export function normalizeLive(payload: unknown): LivePayload {
  const root = rec(payload);
  const rawOrders = Array.isArray(root.active_orders)
    ? root.active_orders
    : Array.isArray(root.orders)
      ? root.orders
      : [];
  return {
    riders: listOf(payload, 'riders').map((r, i) => {
      const x = rec(r);
      return {
        id: str(x.id) ?? `rider-${i}`,
        name: str(x.name) ?? `Rider ${i + 1}`,
        status: str(x.status) ?? 'unknown',
        vehicle: typeof x.vehicle === 'string' ? x.vehicle : null,
        lat: num(x.lat),
        lng: num(x.lng),
      } satisfies LiveRider;
    }),
    active_orders: rawOrders.map((o, i) => {
      const x = rec(o);
      return {
        id: str(x.id) ?? `order-${i}`,
        status: str(x.status) ?? 'unknown',
        total: num(x.total ?? x.grand_total),
        store_name: str(x.store_name ?? x.storeName ?? x.store),
        buyer_name: str(x.buyer_name ?? x.buyerName ?? x.buyer),
      } satisfies LiveOrder;
    }),
  };
}

export function normalizePromos(payload: unknown): Promo[] {
  return listOf(payload, 'promos').map((p) => {
    const x = rec(p);
    return {
      id:
        typeof x.id === 'string' || typeof x.id === 'number' ? x.id : (str(x.code) ?? undefined),
      code: str(x.code) ?? '—',
      kind: str(x.kind) ?? '—',
      value: num(x.value) ?? 0,
      max_discount: num(x.max_discount),
      min_order: num(x.min_order),
      active: typeof x.active === 'boolean' ? x.active : true,
    } satisfies Promo;
  });
}

export function normalizeStores(payload: unknown): StorePin[] {
  return listOf(payload, 'stores').map((s, i) => {
    const x = rec(s);
    return {
      id: (x.id as string | number | undefined) ?? i,
      name: str(x.name) ?? `Store ${i + 1}`,
      lat: num(x.lat),
      lng: num(x.lng),
    } satisfies StorePin;
  });
}

export const fetchLive = (): Promise<LivePayload> => get<unknown>('/api/ops/live').then(normalizeLive);
export const fetchStores = (): Promise<StorePin[]> => apiGet<unknown>('/api/stores').then(normalizeStores);
export const fetchPromos = (): Promise<Promo[]> => get<unknown>('/api/ops/promos').then(normalizePromos);
export const assignOrder = (orderId: string, riderId: string): Promise<unknown> =>
  post('/api/ops/assign', { orderId, riderId });
export const broadcast = (message: string): Promise<unknown> => post('/api/ops/broadcast', { message });
export const createPromo = (input: PromoCreate): Promise<unknown> => post('/api/ops/promos', input);

const RIDER_COLORS: Record<string, string> = {
  online: '#00b14f',
  available: '#00b14f',
  idle: '#00b14f',
  busy: '#2563eb',
  delivering: '#2563eb',
  on_delivery: '#2563eb',
  on_trip: '#2563eb',
  offline: '#78716c',
};

export const riderColor = (status: string): string =>
  RIDER_COLORS[status.trim().toLowerCase()] ?? '#f59e0b';
