// KaonCDO store-owner UI — contract types mirroring the API (PLAN.md §4).
//
// Exact snake_case shapes: when the API stops sending a field the UI must
// break loudly (error state / contract-check), never render a silent
// fallback. scripts/contract-check.mjs asserts these shapes against a live
// API; see issue #14 for why the old alias-soup normalizers were removed.

export type OrderStatus =
  | 'placed'
  | 'store_accepted'
  | 'preparing'
  | 'ready'
  | 'rider_assigned'
  | 'picked_up'
  | 'delivering'
  | 'delivered'
  | 'cancelled'
  | (string & {});

export interface OrderSummary {
  id: string;
  buyer_id: string;
  buyer_name: string | null;
  buyer_email: string | null;
  buyer_phone: string | null;
  store_id: string;
  store_name: string;
  status: OrderStatus;
  subtotal: number;
  delivery_fee: number;
  service_fee: number;
  discount: number;
  total: number;
  promo_code: string | null;
  payment_method: string | null;
  payment_status: string;
  buyer_lat: number | null;
  buyer_lng: number | null;
  created_at: string;
  items_count: number;
}

export type OrdersListPayload = { orders: OrderSummary[] };

/** Buyer choice stored on order_items.options: {choiceId, name, price_delta}. */
export interface OrderItemChoice {
  choiceId?: string | null;
  name?: string | null;
  price_delta?: number | string | null;
}

export interface OrderDetailItem {
  id: string;
  order_id: string;
  item_id: string | null;
  name: string;
  unit_price: number;
  qty: number;
  options: Array<string | OrderItemChoice>;
  line_total: number;
}

export interface OrderTimelineEntry {
  at: string;
  status: string;
  note?: string | null;
}

export interface OrderPayment {
  id: string;
  order_id: string;
  method: string;
  amount: number;
  status: string;
  ref_code: string | null;
}

export interface OrderDetail extends OrderSummary {
  timeline: OrderTimelineEntry[];
  items: OrderDetailItem[];
  payment: OrderPayment | null;
}

export type OrderDetailPayload = { order: OrderDetail };

export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  is_available: boolean;
  image: string | null;
  category_id: string | null;
}

export interface MenuCategory {
  id: string;
  name: string;
  items: MenuItem[];
}

export type MenuPayload = { categories: MenuCategory[] };

export interface StoreStats {
  ownerId: string;
  store_count: number;
  revenue_today: number;
  active_count: number;
  delivered_today: number;
}

export type RejectReason = 'out_of_stock' | 'too_busy' | 'closed';

export type StoreAction = 'accept' | 'reject' | 'preparing' | 'ready';

export type StatusGroup = 'new' | 'preparing' | 'ready' | 'on_the_way' | 'done';
