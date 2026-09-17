// Store-owner API helpers. Reuses src/lib/api.ts (api/apiGet) and forces
// the `x-persona: store_owner` stub-auth header (api() keeps an explicit header).
import { api, apiGet, type StoreSummary, type StoresPayload } from '../../lib/api';
import type {
  MenuCategory,
  MenuItem,
  MenuPayload,
  OrderDetail,
  OrderDetailPayload,
  OrderSummary,
  OrdersListPayload,
  StoreAction,
  StoreStats,
} from './types';

/** Default owner identity — change in one place (sent as ?ownerEmail=). */
export const OWNER_EMAIL = 'owner1@example.com';

export const STORE_ID_STORAGE_KEY = 'kaoncdo:storeId';

const STORE_PERSONA_HEADERS: HeadersInit = { 'x-persona': 'store_owner' };

export function apiStoreGet<T>(path: string): Promise<T> {
  return api<T>(path, { method: 'GET', headers: STORE_PERSONA_HEADERS });
}

export function apiStorePatch<T>(path: string, body: Record<string, unknown>): Promise<T> {
  return api<T>(path, {
    method: 'PATCH',
    headers: STORE_PERSONA_HEADERS,
    body: JSON.stringify(body),
  });
}

export function withOwnerEmail(path: string): string {
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}ownerEmail=${encodeURIComponent(OWNER_EMAIL)}`;
}

// ---------- normalizers (canonical contract shapes — issue #14) ----------
// One shape per payload, no alias chains. A contract change must surface as
// a visible error (or a contract-check failure), never a silent empty list.

export function normalizeStores(payload: StoresPayload | undefined): StoreSummary[] {
  if (!payload || Array.isArray(payload)) return [];
  return payload.stores ?? [];
}

export function normalizeOrders(payload: OrdersListPayload | undefined): OrderSummary[] {
  return payload?.orders ?? [];
}

export function normalizeOrderDetail(payload: OrderDetailPayload | undefined | null): OrderDetail | null {
  return payload?.order ?? null;
}

export function normalizeCategories(payload: MenuPayload | undefined): MenuCategory[] {
  return payload?.categories ?? [];
}

export function menuItemsOf(cat: MenuCategory): MenuItem[] {
  return cat.items ?? [];
}

// ---------- field accessors (exact contract keys) ----------

export function toNumber(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

export function orderBuyer(o: OrderSummary | OrderDetail): string {
  return o.buyer_name ?? 'Walk-in buyer';
}

export function orderTotal(o: OrderSummary | OrderDetail): number {
  return o.total ?? 0;
}

export function orderCreatedAt(o: OrderSummary | OrderDetail): string | null {
  return o.created_at ?? null;
}

export function orderItemsCount(o: OrderSummary): number {
  return o.items_count ?? 0;
}

export function statsNumbers(s: StoreStats | undefined): {
  todayRevenue: number;
  activeCount: number;
  deliveredToday: number;
} {
  if (!s) return { todayRevenue: 0, activeCount: 0, deliveredToday: 0 };
  return {
    todayRevenue: s.revenue_today ?? 0,
    activeCount: s.active_count ?? 0,
    deliveredToday: s.delivered_today ?? 0,
  };
}

export function menuItemAvailable(m: MenuItem): boolean {
  return m.is_available ?? true;
}

export function menuItemPrice(m: MenuItem): number {
  return toNumber(m.price, 0);
}

// ---------- query fns (exact contract paths) ----------

export function fetchActiveOrders(): Promise<OrderSummary[]> {
  return apiStoreGet<OrdersListPayload>(withOwnerEmail('/api/store/orders')).then(normalizeOrders);
}

export function fetchAllOrders(): Promise<OrderSummary[]> {
  const path = withOwnerEmail('/api/store/orders?scope=all');
  return apiStoreGet<OrdersListPayload>(path).then(normalizeOrders);
}

export function fetchOrderDetail(id: string | number): Promise<OrderDetail | null> {
  const path = withOwnerEmail(`/api/store/orders/${encodeURIComponent(String(id))}`);
  return apiStoreGet<OrderDetailPayload>(path).then(normalizeOrderDetail);
}

export function fetchStats(): Promise<StoreStats> {
  return apiStoreGet<StoreStats>(withOwnerEmail('/api/store/stats'));
}

export function fetchStoresRaw(): Promise<StoresPayload> {
  // Store list is public; still send store_owner persona for consistency.
  return apiStoreGet<StoresPayload>('/api/stores').catch(() =>
    apiGet<StoresPayload>('/api/stores'),
  );
}

export function fetchMenu(storeId: string | number): Promise<MenuCategory[]> {
  return apiStoreGet<MenuPayload>(
    `/api/stores/${encodeURIComponent(String(storeId))}/menu`,
  ).then(normalizeCategories);
}

export async function patchOrderAction(
  id: string | number,
  action: StoreAction,
  reason?: string,
): Promise<OrderDetail> {
  const body: Record<string, unknown> = { action };
  if (action === 'reject' && reason) body.reason = reason;
  const path = withOwnerEmail(`/api/store/orders/${encodeURIComponent(String(id))}`);
  // Issue #11: errors must reject so the caller's mutation onError fires.
  // The old `.catch(() => null)` resolved null on failure and the UI toasted
  // "Order accepted" for actions the API had rejected (403/404/409).
  const order = normalizeOrderDetail(await apiStorePatch<OrderDetailPayload>(path, body));
  if (!order) throw new Error('Store action returned no order');
  return order;
}

export function patchMenuItem(
  id: string | number,
  patch: { is_available?: boolean; price?: number },
): Promise<unknown> {
  return apiStorePatch<unknown>(
    `/api/menu-items/${encodeURIComponent(String(id))}`,
    patch,
  );
}
