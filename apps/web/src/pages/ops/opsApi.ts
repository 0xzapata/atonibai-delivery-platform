// Ops API helpers. Reuses src/lib/api.ts and forces `x-persona: operator`
// (api() keeps an explicit header, so this overrides the stored persona).
import { api, apiGet } from '../../lib/api';

// ---------- types (match live contract, defensive at runtime) ----------

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

const OPS_HEADERS: HeadersInit = { 'x-persona': 'operator' };

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

function toNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toStr(v: unknown): string | null {
  if (typeof v === 'string' && v !== '') return v;
  if (typeof v === 'number') return String(v);
  return null;
}

// ---------- normalizers ----------

export function normalizeLive(payload: unknown): LivePayload {
  const root = asRecord(payload);
  const rawRiders = Array.isArray(root.riders) ? root.riders : [];
  const rawOrders = Array.isArray(root.active_orders)
    ? root.active_orders
    : Array.isArray(root.orders)
      ? root.orders
      : [];
  return {
    riders: rawRiders.map((r, i) => {
      const rec = asRecord(r);
      return {
        id: toStr(rec.id) ?? `rider-${i}`,
        name: toStr(rec.name) ?? `Rider ${i + 1}`,
        status: toStr(rec.status) ?? 'unknown',
        vehicle: typeof rec.vehicle === 'string' ? rec.vehicle : null,
        lat: toNum(rec.lat),
        lng: toNum(rec.lng),
      } satisfies LiveRider;
    }),
    active_orders: rawOrders.map((o, i) => {
      const rec = asRecord(o);
      return {
        id: toStr(rec.id) ?? `order-${i}`,
        status: toStr(rec.status) ?? 'unknown',
        total: toNum(rec.total ?? rec.grand_total),
        store_name: toStr(rec.store_name ?? rec.storeName ?? rec.store),
        buyer_name: toStr(rec.buyer_name ?? rec.buyerName ?? rec.buyer),
      } satisfies LiveOrder;
    }),
  };
}

export function normalizePromos(payload: unknown): Promo[] {
  const root = asRecord(payload);
  const raw = Array.isArray(payload)
    ? payload
    : Array.isArray(root.promos)
      ? root.promos
      : [];
  return raw.map((p) => {
    const rec = asRecord(p);
    return {
      id:
        typeof rec.id === 'string' || typeof rec.id === 'number'
          ? rec.id
          : (toStr(rec.code) ?? undefined),
      code: toStr(rec.code) ?? '—',
      kind: toStr(rec.kind) ?? '—',
      value: toNum(rec.value) ?? 0,
      max_discount: toNum(rec.max_discount),
      min_order: toNum(rec.min_order),
      active: typeof rec.active === 'boolean' ? rec.active : true,
    } satisfies Promo;
  });
}

export function normalizeStores(payload: unknown): StorePin[] {
  const root = asRecord(payload);
  const raw = Array.isArray(payload)
    ? payload
    : Array.isArray(root.stores)
      ? root.stores
      : [];
  return raw.map((s, i) => {
    const rec = asRecord(s);
    return {
      id: (rec.id as string | number | undefined) ?? i,
      name: toStr(rec.name) ?? `Store ${i + 1}`,
      lat: toNum(rec.lat),
      lng: toNum(rec.lng),
    } satisfies StorePin;
  });
}

// ---------- query fns (exact contract paths) ----------

export function fetchLive(): Promise<LivePayload> {
  return api<unknown>('/api/ops/live', { method: 'GET', headers: OPS_HEADERS }).then(
    normalizeLive,
  );
}

/** Public store directory — used to pin active-order stores on the map. */
export function fetchStores(): Promise<StorePin[]> {
  return apiGet<unknown>('/api/stores').then(normalizeStores);
}

export function fetchPromos(): Promise<Promo[]> {
  return api<unknown>('/api/ops/promos', {
    method: 'GET',
    headers: OPS_HEADERS,
  }).then(normalizePromos);
}

export function assignOrder(orderId: string, riderId: string): Promise<unknown> {
  return api<unknown>('/api/ops/assign', {
    method: 'POST',
    headers: OPS_HEADERS,
    body: JSON.stringify({ orderId, riderId }),
  });
}

export function broadcast(message: string): Promise<unknown> {
  return api<unknown>('/api/ops/broadcast', {
    method: 'POST',
    headers: OPS_HEADERS,
    body: JSON.stringify({ message }),
  });
}

export function createPromo(input: PromoCreate): Promise<unknown> {
  return api<unknown>('/api/ops/promos', {
    method: 'POST',
    headers: OPS_HEADERS,
    body: JSON.stringify(input),
  });
}

// ---------- presentation helpers ----------

/** Marker color for a rider status (DB values: online | busy). */
export function riderColor(status: string): string {
  switch (status.trim().toLowerCase()) {
    case 'online':
    case 'available':
    case 'idle':
      return '#00b14f';
    case 'busy':
    case 'delivering':
    case 'on_delivery':
    case 'on_trip':
      return '#2563eb';
    case 'offline':
      return '#78716c';
    default:
      return '#f59e0b';
  }
}
