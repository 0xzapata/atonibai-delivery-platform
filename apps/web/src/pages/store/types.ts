// KaonCDO store-owner UI — shared contract types (defensive: backend lands in parallel).
// All shapes tolerate camelCase/snake_case variants and wrapped/unwrapped payloads.

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
  id: string | number;
  buyer_name?: string | null;
  buyerName?: string | null;
  buyer?: string | { name?: string | null } | null;
  status: OrderStatus;
  total?: number | string | null;
  grand_total?: number | string | null;
  created_at?: string | null;
  createdAt?: string | null;
  items_count?: number | null;
  itemsCount?: number | null;
  item_count?: number | null;
  store_id?: string | number | null;
  storeId?: string | number | null;
  store_name?: string | null;
}

export type OrdersListPayload =
  | { orders: OrderSummary[] }
  | { data: OrderSummary[] }
  | OrderSummary[];

export interface OrderItemChoice {
  name?: string | null;
  option?: string | null;
  choice?: string | null;
  label?: string | null;
  price_delta?: number | string | null;
  price?: number | string | null;
}

export interface OrderDetailItem {
  id?: string | number | null;
  name?: string | null;
  title?: string | null;
  menu_item_name?: string | null;
  qty?: number | null;
  quantity?: number | null;
  count?: number | null;
  price?: number | string | null;
  unit_price?: number | string | null;
  line_total?: number | string | null;
  total?: number | string | null;
  notes?: string | null;
  options?: Array<string | OrderItemChoice> | null;
  choices?: Array<string | OrderItemChoice> | null;
  modifiers?: Array<string | OrderItemChoice> | null;
}

export interface OrderTimelineEntry {
  status?: string | null;
  label?: string | null;
  event?: string | null;
  at?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
  timestamp?: string | null;
}

export interface OrderPayment {
  method?: string | null;
  provider?: string | null;
  status?: string | null;
  state?: string | null;
}

export interface OrderReview {
  id?: string | number | null;
  rating?: number | null;
  stars?: number | null;
  comment?: string | null;
  body?: string | null;
  text?: string | null;
  created_at?: string | null;
  author?: string | null;
  buyer_name?: string | null;
}

export interface OrderDetail extends OrderSummary {
  items?: OrderDetailItem[] | null;
  order_items?: OrderDetailItem[] | null;
  orderItems?: OrderDetailItem[] | null;
  lines?: OrderDetailItem[] | null;
  buyer_email?: string | null;
  buyer_phone?: string | null;
  buyer_address?: string | null;
  address?: string | null;
  payment?: OrderPayment | string | null;
  payment_method?: string | null;
  paymentMethod?: string | null;
  payment_status?: string | null;
  subtotal?: number | string | null;
  delivery_fee?: number | string | null;
  deliveryFee?: number | string | null;
  service_fee?: number | string | null;
  discount?: number | string | null;
  timeline?: OrderTimelineEntry[] | null;
  events?: OrderTimelineEntry[] | null;
  history?: OrderTimelineEntry[] | null;
  reviews?: OrderReview[] | null;
  cancel_reason?: string | null;
  reject_reason?: string | null;
  notes?: string | null;
}

export type OrderDetailPayload =
  | { order: OrderDetail }
  | { data: OrderDetail }
  | OrderDetail;

export interface MenuItem {
  id: string | number;
  name: string;
  description?: string | null;
  price: number | string;
  is_available?: boolean | null;
  isAvailable?: boolean | null;
  available?: boolean | null;
  image?: string | null;
  category_id?: string | number | null;
}

export interface MenuCategory {
  id: string | number;
  name: string;
  title?: string | null;
  items?: MenuItem[] | null;
  menu_items?: MenuItem[] | null;
  menuItems?: MenuItem[] | null;
}

export type MenuPayload =
  | { categories: MenuCategory[] }
  | { menu: MenuCategory[] }
  | { data: MenuCategory[] }
  | MenuCategory[];

export interface StoreStats {
  todayRevenue?: number | string | null;
  today_revenue?: number | string | null;
  revenueToday?: number | string | null;
  revenue_today?: number | string | null;
  activeCount?: number | null;
  active_count?: number | null;
  activeOrders?: number | null;
  deliveredToday?: number | null;
  delivered_today?: number | null;
  delivered?: number | null;
}

export type RejectReason = 'out_of_stock' | 'too_busy' | 'closed';

export type StoreAction = 'accept' | 'reject' | 'preparing' | 'ready';

export type StatusGroup = 'new' | 'preparing' | 'ready' | 'on_the_way' | 'done';
