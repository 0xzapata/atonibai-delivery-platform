// Store-owner API helpers (canonical shared bits live here; support imports relatively).
import { api, apiGet, type StoresPayload } from '../../lib/api';
import type {
  MenuCategory, MenuItem, MenuPayload, OrderDetail, OrderDetailItem, OrderDetailPayload,
  OrderSummary, OrdersListPayload, StoreAction, StoreStats,
} from './types';

export const OWNER_EMAIL = 'owner1@example.com';
export const STORE_ID_STORAGE_KEY = 'kaoncdo:storeId';
const STORE_PERSONA_HEADERS: HeadersInit = { 'x-persona': 'store_owner' };

// Shared low-level helpers (also used by support via relative import).
export function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}
export function toStr(v: unknown): string | null {
  if (typeof v === 'string' && v !== '') return v;
  if (typeof v === 'number') return String(v);
  return null;
}
export function pickList<T>(payload: unknown, keys: string[]): T[] {
  if (Array.isArray(payload)) return payload as T[];
  const r = asRecord(payload);
  for (const k of keys) if (Array.isArray(r[k])) return r[k] as T[];
  return [];
}
export function firstObj(payload: unknown, keys: string[]): Record<string, unknown> | null {
  const r = asRecord(payload);
  for (const k of keys) {
    const v = r[k];
    if (v && typeof v === 'object') return v as Record<string, unknown>;
  }
  return null;
}

export function apiStoreGet<T>(path: string): Promise<T> {
  return api<T>(path, { method: 'GET', headers: STORE_PERSONA_HEADERS });
}
export function apiStorePatch<T>(path: string, body: Record<string, unknown>): Promise<T> {
  return api<T>(path, { method: 'PATCH', headers: STORE_PERSONA_HEADERS, body: JSON.stringify(body) });
}
export function withOwnerEmail(path: string): string {
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}ownerEmail=${encodeURIComponent(OWNER_EMAIL)}`;
}

export function normalizeStores(payload: StoresPayload | undefined): Array<{ id: string | number; name: string }> {
  if (!payload) return [];
  const raw = Array.isArray(payload) ? payload : payload.stores;
  if (!Array.isArray(raw)) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return raw.map((s: any, i: number) => ({ id: s?.id ?? i, name: s?.name ?? `Store ${s?.id ?? i + 1}` }));
}
export function normalizeOrders(p: OrdersListPayload | undefined): OrderSummary[] {
  return pickList<OrderSummary>(p, ['orders', 'data']);
}
export function normalizeOrderDetail(p: OrderDetailPayload | undefined): OrderDetail | null {
  if (!p || Array.isArray(p)) return null;
  return (firstObj(p, ['order', 'data']) as OrderDetail | null) ?? (p as OrderDetail);
}
export function normalizeCategories(p: MenuPayload | undefined): MenuCategory[] {
  return pickList<MenuCategory>(p, ['categories', 'menu', 'data']);
}
export function menuItemsOf(cat: MenuCategory): MenuItem[] {
  if (Array.isArray(cat.items)) return cat.items;
  if (Array.isArray(cat.menu_items)) return cat.menu_items as MenuItem[];
  if (Array.isArray(cat.menuItems)) return cat.menuItems as MenuItem[];
  return [];
}

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
export function orderItemsOf(d: OrderDetail): OrderDetailItem[] {
  const list = d.items ?? d.order_items ?? d.orderItems ?? d.lines ?? [];
  return (Array.isArray(list) ? list : []) as OrderDetailItem[];
}
export function orderTimelineOf(d: OrderDetail): OrderDetail['timeline'] & {} {
  const list = d.timeline ?? d.events ?? d.history ?? [];
  return (Array.isArray(list) ? list : []) as NonNullable<OrderDetail['timeline']>;
}
export function statsNumbers(s: StoreStats | undefined): { todayRevenue: number; activeCount: number; deliveredToday: number } {
  if (!s) return { todayRevenue: 0, activeCount: 0, deliveredToday: 0 };
  return {
    todayRevenue: toNumber(s.todayRevenue ?? s.today_revenue ?? s.revenueToday ?? s.revenue_today ?? 0),
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

export function fetchActiveOrders(): Promise<OrderSummary[]> {
  return apiStoreGet<OrdersListPayload>(withOwnerEmail('/api/store/orders')).then(normalizeOrders);
}
export function fetchAllOrders(): Promise<OrderSummary[]> {
  return apiStoreGet<OrdersListPayload>(withOwnerEmail('/api/store/orders?scope=all')).then(normalizeOrders);
}
export function fetchOrderDetail(id: string | number): Promise<OrderDetail | null> {
  return apiStoreGet<OrderDetailPayload>(withOwnerEmail(`/api/store/orders/${encodeURIComponent(String(id))}`)).then(normalizeOrderDetail);
}
export function fetchOrderPublic(id: string | number): Promise<Record<string, unknown> | null> {
  return apiStoreGet<Record<string, unknown>>(`/api/orders/${encodeURIComponent(String(id))}`).catch(() => null);
}
export function fetchStats(): Promise<StoreStats> {
  return apiStoreGet<StoreStats>(withOwnerEmail('/api/store/stats'));
}
export function fetchStoresRaw(): Promise<StoresPayload> {
  return apiStoreGet<StoresPayload>('/api/stores').catch(() => apiGet<StoresPayload>('/api/stores'));
}
export function fetchMenu(storeId: string | number): Promise<MenuCategory[]> {
  return apiStoreGet<MenuPayload>(`/api/stores/${encodeURIComponent(String(storeId))}/menu`).then(normalizeCategories);
}
export function patchOrderAction(id: string | number, action: StoreAction, reason?: string): Promise<OrderDetail | null> {
  const body: Record<string, unknown> = { action };
  if (action === 'reject' && reason) body.reason = reason;
  return apiStorePatch<OrderDetailPayload>(withOwnerEmail(`/api/store/orders/${encodeURIComponent(String(id))}`), body)
    .then(normalizeOrderDetail).catch(() => null);
}
export function patchMenuItem(id: string | number, patch: { is_available?: boolean; price?: number }): Promise<unknown> {
  return apiStorePatch<unknown>(`/api/menu-items/${encodeURIComponent(String(id))}`, patch);
}
