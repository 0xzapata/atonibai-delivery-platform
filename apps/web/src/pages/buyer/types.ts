import type { StoresPayload } from '../../lib/api';

/** Store summary as served by GET /api/stores (normalized, null-tolerant). */
export interface Store {
  id: string;
  name: string;
  cuisine: string;
  image: string | null;
  rating: number | null;
  delivery_fee: number | null;
  is_open: boolean | null;
  lat: number | null;
  lng: number | null;
}

export interface MenuChoice {
  id: string;
  name: string;
  price_delta: number;
}

export interface MenuOption {
  id: string;
  name: string;
  required: boolean;
  multi: boolean;
  choices: MenuChoice[];
}

export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image: string | null;
  is_available: boolean;
  rating: number | null;
  options: MenuOption[];
}

export interface MenuCategory {
  id: string;
  name: string;
  items: MenuItem[];
}

/** Narrow an unknown JSON value to a record without throwing. */
export function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asNum(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asStr(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

/** Accept both { stores: [...] } and bare-array payloads. */
export function normalizeStores(payload: StoresPayload | undefined): Store[] {
  if (!payload) return [];
  const list = Array.isArray(payload) ? payload : payload.stores;
  if (!Array.isArray(list)) return [];
  return list.map((s, i) => {
    const r = asRecord(s);
    return {
      id: String(r.id ?? `store-${i}`),
      name: asStr(r.name) ?? `Store ${i + 1}`,
      cuisine: asStr(r.cuisine) ?? 'Mixed',
      image: asStr(r.image),
      rating: asNum(r.rating),
      delivery_fee: asNum(r.delivery_fee ?? r.deliveryFee),
      is_open: typeof r.is_open === 'boolean' ? (r.is_open as boolean) : null,
      lat: asNum(r.lat),
      lng: asNum(r.lng),
    } satisfies Store;
  });
}

export function normalizeMenu(payload: unknown): MenuCategory[] {
  const root = asRecord(payload);
  const raw = root.categories ?? root.menu ?? [];
  if (!Array.isArray(raw)) return [];
  return raw.map((c, ci) => {
    const cr = asRecord(c);
    const itemsRaw = cr.items;
    const items: MenuItem[] = Array.isArray(itemsRaw)
      ? itemsRaw.map((it, ii) => {
          const ir = asRecord(it);
          const optsRaw = ir.options;
          const options: MenuOption[] = Array.isArray(optsRaw)
            ? optsRaw.map((o, oi) => {
                const or = asRecord(o);
                const chRaw = or.choices;
                const choices: MenuChoice[] = Array.isArray(chRaw)
                  ? chRaw.map((ch, chi) => {
                      const chr = asRecord(ch);
                      return {
                        id: String(chr.id ?? `${ci}-${ii}-${oi}-${chi}`),
                        name: asStr(chr.name) ?? `Choice ${chi + 1}`,
                        price_delta: asNum(chr.price_delta ?? chr.priceDelta) ?? 0,
                      } satisfies MenuChoice;
                    })
                  : [];
                return {
                  id: String(or.id ?? `${ci}-${ii}-${oi}`),
                  name: asStr(or.name) ?? `Option ${oi + 1}`,
                  required: or.required === true,
                  multi: or.multi === true,
                  choices,
                } satisfies MenuOption;
              })
            : [];
          return {
            id: String(ir.id ?? `${ci}-${ii}`),
            name: asStr(ir.name) ?? `Item ${ii + 1}`,
            description: asStr(ir.description),
            price: asNum(ir.price) ?? 0,
            image: asStr(ir.image),
            is_available: ir.is_available !== false,
            rating: asNum(ir.rating),
            options,
          } satisfies MenuItem;
        })
      : [];
    return {
      id: String(cr.id ?? `cat-${ci}`),
      name: asStr(cr.name) ?? `Category ${ci + 1}`,
      items,
    } satisfies MenuCategory;
  });
}

export interface OrderInfo {
  id: string;
  status: string;
  total: number | null;
  subtotal: number | null;
  delivery_fee: number | null;
  discount: number | null;
  eta_min: number | null;
  pickup_pin: string | null;
  timeline: unknown;
  payment_method: string | null;
  created_at: string | null;
}

/** Accept both { order: {...} } and flat order payloads (+ camelCase aliases). */
export function toOrderInfo(payload: unknown): OrderInfo | null {
  const root = asRecord(payload);
  const src = asRecord(root.order ?? payload);
  const id = src.id ?? root.id;
  if (id === undefined || id === null || id === '') return null;
  return {
    id: String(id),
    status: String(src.status ?? 'placed'),
    total: asNum(src.total),
    subtotal: asNum(src.subtotal),
    delivery_fee: asNum(src.delivery_fee ?? src.deliveryFee),
    discount: asNum(src.discount),
    eta_min: asNum(src.eta_min ?? src.etaMin),
    pickup_pin: asStr(src.pickup_pin ?? src.pickupPin ?? src.pin),
    timeline: src.timeline ?? [],
    payment_method: asStr(src.payment_method ?? src.paymentMethod),
    created_at: asStr(src.created_at ?? src.createdAt),
  };
}

export interface StoreLite {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  image: string | null;
}

export function toStoreLite(payload: unknown): StoreLite | null {
  const r = asRecord(payload);
  if (r.id === undefined && r.name === undefined) return null;
  return {
    id: String(r.id ?? ''),
    name: asStr(r.name) ?? 'Store',
    lat: asNum(r.lat),
    lng: asNum(r.lng),
    image: asStr(r.image),
  };
}

export interface TimelineEntry {
  label: string;
  at: string | null;
}

/** Timeline entries may be plain strings or { status, at } objects. */
export function normalizeTimeline(timeline: unknown, fallbackStatus: string): TimelineEntry[] {
  if (!Array.isArray(timeline)) {
    return [{ label: fallbackStatus, at: null }];
  }
  const entries = timeline.map((e) => {
    if (typeof e === 'string') return { label: e, at: null } satisfies TimelineEntry;
    const r = asRecord(e);
    const label =
      asStr(r.status) ?? asStr(r.label) ?? asStr(r.step) ?? asStr(r.title) ?? 'update';
    const at = asStr(r.at ?? r.created_at ?? r.createdAt ?? r.timestamp ?? r.time);
    return { label, at } satisfies TimelineEntry;
  });
  return entries.length > 0 ? entries : [{ label: fallbackStatus, at: null }];
}

export function peso(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return `\u20B1${rounded.toLocaleString('en-PH', { maximumFractionDigits: 2, minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2 })}`;
}

export function imgFallback(seed: string): string {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/600/400`;
}
