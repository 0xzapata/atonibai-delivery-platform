// Store-owner API helpers. Reuses src/lib/api.ts (api/apiGet) and forces
// the `x-persona: store_owner` stub-auth header (api() keeps an explicit header).
import { api, apiGet, type StoresPayload } from '../../lib/api';
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

// ---------- normalizers (defensive: backend lands in parallel) ----------

export function normalizeStores(payload: StoresPayload | undefined): Array<{
  id: string | number;
  name: string;
}> {
  if (!payload) return [];
  const raw = Array.isArray(payload) ? payload : payload.stores;
  if (!Array.isArray(raw)) return [];
  return raw.map((s, i) => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    id: (s as any)?.id ?? i,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    name: (s as any)?.name ?? `Store ${(s as any)?.id ?? i + 1}`,
  }));
}

export function normalizeOrders(payload: OrdersListPayload | undefined): OrderSummary[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if ('orders' in payload && Array.isArray(payload.orders)) return payload.orders;
  if ('data' in payload && Array.isArray(payload.data)) return payload.data;
  return [];
}

export function normalizeOrderDetail(payload: OrderDetailPayload | undefined): OrderDetail | null {
  if (!payload) return null;
  if (Array.isArray(payload)) return null;
  const maybe = payload as Record<string, unknown>;
  if (maybe.order && typeof maybe.order === 'object') return maybe.order as OrderDetail;
  if (maybe.data && typeof maybe.data === 'object') return maybe.data as OrderDetail;
  return payload as OrderDetail;
}

export function normalizeCategories(payload: MenuPayload | undefined): MenuCategory[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if ('categories' in payload && Array.isArray(payload.categories)) return payload.categories;
  if ('menu' in payload && Array.isArray(payload.menu)) return payload.menu;
  if ('data' in payload && Array.isArray(payload.data)) return payload.data;
  return [];
}

export function menuItemsOf(cat: MenuCategory): MenuItem[] {
  if (Array.isArray(cat.items)) return cat.items;
  if (Array.isArray(cat.menu_items)) return cat.menu_items as MenuItem[];
  if (Array.isArray(cat.menuItems)) return cat.menuItems as MenuItem[];
  return [];
}

// ---------- field accessors (snake/camel tolerant) ----------

export function toNumber(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

export function orderBuyer(o: OrderSummary | OrderDetail): string {
  if (o.buyer_name) return o.buyer_name;
  if (o.buyerName) return o.buyerName;
  if (typeof o.buyer === 'string') return o.buyer;
  if (o.buyer && typeof o.buyer === 'object' && o.buyer.name) return o.buyer.name;
  return 'Walk-in buyer';
}

export function orderTotal(o: OrderSummary | OrderDetail): number {
  return toNumber(o.total ?? o.grand_total ?? 0);
}

export function orderCreatedAt(o: OrderSummary | OrderDetail): string | null {
  return o.created_at ?? o.createdAt ?? null;
}

export function orderItemsCount(o: OrderSummary): number {
  return o.items_count ?? o.itemsCount ?? o.item_count ?? 0;
}

export function orderItemsOf(d: OrderDetail): OrderDetail['items'] & {} {
  const list =
    d.items ?? d.order_items ?? d.orderItems ?? d.lines ?? [];
  return (Array.isArray(list) ? list : []) as NonNullable<OrderDetail['items']>;
}

export function statsNumbers(s: StoreStats | undefined): {
  todayRevenue: number;
  activeCount: number;
  deliveredToday: number;
} {
  if (!s) return { todayRevenue: 0, activeCount: 0, deliveredToday: 0 };
  return {
    todayRevenue: toNumber(
      s.todayRevenue ?? s.today_revenue ?? s.revenueToday ?? s.revenue_today ?? 0,
    ),
    activeCount: toNumber(s.activeCount ?? s.active_count ?? s.activeOrders ?? 0),
    deliveredToday: toNumber(s.deliveredToday ?? s.delivered_today ?? s.delivered ?? 0),
  };
}

export function menuItemAvailable(m: MenuItem): boolean {
  if (typeof m.is_available === 'boolean') return m.is_available;
  if (typeof m.isAvailable === 'boolean') return m.isAvailable;
  if (typeof m.available === 'boolean') return m.available;
  return true;
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

export function fetchOrderPublic(id: string | number): Promise<Record<string, unknown> | null> {
  // Reviews ride along on GET /api/orders/:id when present — defensive optional chaining at call site.
  return apiStoreGet<Record<string, unknown>>(
    `/api/orders/${encodeURIComponent(String(id))}`,
  ).catch(() => null);
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

export function patchOrderAction(
  id: string | number,
  action: StoreAction,
  reason?: string,
): Promise<OrderDetail | null> {
  const body: Record<string, unknown> = { action };
  if (action === 'reject' && reason) body.reason = reason;
  const path = withOwnerEmail(`/api/store/orders/${encodeURIComponent(String(id))}`);
  return apiStorePatch<OrderDetailPayload>(path, body)
    .then(normalizeOrderDetail)
    .catch(() => null);
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
