import type { StoresPayload } from '../../lib/api';

export interface Store { id: string; name: string; cuisine: string; image: string | null; rating: number | null; delivery_fee: number | null; is_open: boolean | null; lat: number | null; lng: number | null; }
export interface MenuChoice { id: string; name: string; price_delta: number; }
export interface MenuOption { id: string; name: string; required: boolean; multi: boolean; choices: MenuChoice[]; }
export interface MenuItem { id: string; name: string; description: string | null; price: number; image: string | null; is_available: boolean; rating: number | null; options: MenuOption[]; }
export interface MenuCategory { id: string; name: string; items: MenuItem[]; }
export interface OrderInfo { id: string; status: string; total: number | null; subtotal: number | null; delivery_fee: number | null; discount: number | null; eta_min: number | null; pickup_pin: string | null; timeline: unknown; payment_method: string | null; created_at: string | null; }
export interface StoreLite { id: string; name: string; lat: number | null; lng: number | null; image: string | null; }
export interface TimelineEntry { label: string; at: string | null; }

export const asRecord = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
const asNum = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const asStr = (v: unknown): string | null =>
  typeof v === 'string' ? v : v === null || v === undefined ? null
  : typeof v === 'number' || typeof v === 'boolean' ? String(v) : null;
const str = (r: Record<string, unknown>, k: string, fb: string) => asStr(r[k]) ?? fb;
const id = (r: Record<string, unknown>, k: string, fb: string) => String(r[k] ?? fb);

export function normalizeStores(payload: StoresPayload | undefined): Store[] {
  if (!payload) return [];
  const list = Array.isArray(payload) ? payload : payload.stores;
  if (!Array.isArray(list)) return [];
  return list.map((s, i) => {
    const r = asRecord(s);
    return { id: id(r, 'id', `store-${i}`), name: str(r, 'name', `Store ${i + 1}`), cuisine: str(r, 'cuisine', 'Mixed'),
      image: asStr(r.image), rating: asNum(r.rating), delivery_fee: asNum(r.delivery_fee ?? r.deliveryFee),
      is_open: typeof r.is_open === 'boolean' ? r.is_open : null, lat: asNum(r.lat), lng: asNum(r.lng) };
  });
}

export function normalizeMenu(payload: unknown): MenuCategory[] {
  const root = asRecord(payload);
  const raw = root.categories ?? root.menu ?? [];
  if (!Array.isArray(raw)) return [];
  return raw.map((c, ci) => {
    const cr = asRecord(c);
    const itemsRaw = cr.items;
    const items: MenuItem[] = Array.isArray(itemsRaw) ? itemsRaw.map((it, ii) => {
      const ir = asRecord(it);
      const optsRaw = ir.options;
      const options: MenuOption[] = Array.isArray(optsRaw) ? optsRaw.map((o, oi) => {
        const or = asRecord(o);
        const chRaw = or.choices;
        const choices: MenuChoice[] = Array.isArray(chRaw) ? chRaw.map((ch, chi) => {
          const chr = asRecord(ch);
          return { id: id(chr, 'id', `${ci}-${ii}-${oi}-${chi}`), name: str(chr, 'name', `Choice ${chi + 1}`),
            price_delta: asNum(chr.price_delta ?? chr.priceDelta) ?? 0 };
        }) : [];
        return { id: id(or, 'id', `${ci}-${ii}-${oi}`), name: str(or, 'name', `Option ${oi + 1}`),
          required: or.required === true, multi: or.multi === true, choices };
      }) : [];
      return { id: id(ir, 'id', `${ci}-${ii}`), name: str(ir, 'name', `Item ${ii + 1}`), description: asStr(ir.description),
        price: asNum(ir.price) ?? 0, image: asStr(ir.image), is_available: ir.is_available !== false,
        rating: asNum(ir.rating), options };
    }) : [];
    return { id: id(cr, 'id', `cat-${ci}`), name: str(cr, 'name', `Category ${ci + 1}`), items };
  });
}

export function toOrderInfo(payload: unknown): OrderInfo | null {
  const root = asRecord(payload);
  const src = asRecord(root.order ?? payload);
  const oid = src.id ?? root.id;
  if (oid === undefined || oid === null || oid === '') return null;
  return { id: String(oid), status: String(src.status ?? 'placed'), total: asNum(src.total),
    subtotal: asNum(src.subtotal), delivery_fee: asNum(src.delivery_fee ?? src.deliveryFee),
    discount: asNum(src.discount), eta_min: asNum(src.eta_min ?? src.etaMin),
    pickup_pin: asStr(src.pickup_pin ?? src.pickupPin ?? src.pin), timeline: src.timeline ?? [],
    payment_method: asStr(src.payment_method ?? src.paymentMethod), created_at: asStr(src.created_at ?? src.createdAt) };
}

export function toStoreLite(payload: unknown): StoreLite | null {
  const r = asRecord(payload);
  if (r.id === undefined && r.name === undefined) return null;
  return { id: String(r.id ?? ''), name: asStr(r.name) ?? 'Store', lat: asNum(r.lat), lng: asNum(r.lng), image: asStr(r.image) };
}

export function normalizeTimeline(timeline: unknown, fallbackStatus: string): TimelineEntry[] {
  if (!Array.isArray(timeline)) return [{ label: fallbackStatus, at: null }];
  const entries = timeline.map((e) => {
    if (typeof e === 'string') return { label: e, at: null };
    const r = asRecord(e);
    return { label: asStr(r.status) ?? asStr(r.label) ?? asStr(r.step) ?? asStr(r.title) ?? 'update',
      at: asStr(r.at ?? r.created_at ?? r.createdAt ?? r.timestamp ?? r.time) };
  });
  return entries.length > 0 ? entries : [{ label: fallbackStatus, at: null }];
}

export const peso = (n: number): string => {
  const r = Math.round(n * 100) / 100;
  return `\u20B1${r.toLocaleString('en-PH', { maximumFractionDigits: 2, minimumFractionDigits: Number.isInteger(r) ? 0 : 2 })}`;
};

export const imgFallback = (seed: string): string =>
  `https://picsum.photos/seed/${encodeURIComponent(seed)}/600/400`;
