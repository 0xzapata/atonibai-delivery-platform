export type Persona = 'buyer' | 'store_owner' | 'rider' | 'operator' | 'support';

export const ORDER_STATUSES = [
  'placed',
  'store_accepted',
  'preparing',
  'ready',
  'rider_assigned',
  'picked_up',
  'delivering',
  'delivered',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const peso = (n: number) => `₱${n.toLocaleString('en-PH')}`;

/** delivery fee = base + per-km (Ops-configurable later) */
export function deliveryFeeForKm(km: number, base = 39, perKm = 8) {
  return Math.round(base + perKm * km);
}

export const PROMOS = {
  KAON20: { kind: 'percent', value: 20, max_discount: 100, min_order: 150 },
  FREESHIP: { kind: 'freeship', value: 0, max_discount: 0, min_order: 200 },
} as const;
