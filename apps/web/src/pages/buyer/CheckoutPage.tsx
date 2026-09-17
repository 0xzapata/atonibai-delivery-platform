import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../../lib/api';
import { CENTRIO_LAT, CENTRIO_LNG } from './geo';
import { cartSubtotal, useBuyerCart } from './cart';
import { evaluatePromo } from './promos';
import { toast } from './toast';
import { peso } from './types';

type PayMethod = 'COD' | 'GCash-mock' | 'Card-mock';
const PAY_LABELS: Record<PayMethod, string> = { COD: 'Cash on delivery', 'GCash-mock': 'GCash (mock)', 'Card-mock': 'Card (mock)' };
const ACCENT = { backgroundColor: 'var(--accent)' } as const;
const FIELD = 'w-full rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm outline-none focus:border-emerald-500';
const digits = (v: string) => v.replace(/\D/g, '').length;

const idemKey = (): string => {
  try {
    const c = globalThis.crypto as unknown as { randomUUID?: () => string } | undefined;
    if (c?.randomUUID) return c.randomUUID();
  } catch { /* fallback below */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'border-t border-stone-100 pt-2 text-base font-extrabold' : 'text-stone-600'}`}>
      <span>{k}</span><span>{v}</span>
    </div>
  );
}

export default function CheckoutPage() {
  const navigate = useNavigate();
  const cart = useBuyerCart();
  const { storeId, storeName, deliveryFee: feeBase, lines } = cart;

  const [promoCode, setPromoCode] = useState('');
  const [applied, setApplied] = useState(false);
  const [method, setMethod] = useState<PayMethod>('COD');
  const [gcash, setGcash] = useState('');
  const [card, setCard] = useState('');
  const [exp, setExp] = useState('');
  const [cvc, setCvc] = useState('');
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState('');

  const subtotal = cartSubtotal(lines);
  const promo = useMemo(() => evaluatePromo(applied ? promoCode : '', subtotal), [applied, promoCode, subtotal]);
  const fee = promo.freeDelivery && promo.ok ? 0 : (feeBase ?? 49);
  const total = Math.max(0, subtotal - (promo.ok ? promo.discount : 0) + (lines.length > 0 ? fee : 0));

  async function placeOrder() {
    setError('');
    if (!storeId || lines.length === 0) return setError('Your cart is empty.');
    if (applied && !promo.ok) return setError(promo.message);
    if (method === 'GCash-mock' && digits(gcash) < 7) return setError('Enter a GCash number (mock — any 7+ digits).');
    if (method === 'Card-mock') {
      if (digits(card) < 12) return setError('Enter a card number (mock — any 12+ digits).');
      if (exp.trim() === '' || cvc.trim() === '') return setError('Enter card expiry and CVC (mock values are fine).');
    }
    setPlacing(true);
    try {
      const body: Record<string, unknown> = { storeId, items: lines.map((l) => ({ itemId: l.itemId, qty: l.qty, choices: l.choiceIds })), buyerLat: CENTRIO_LAT, buyerLng: CENTRIO_LNG, paymentMethod: method };
      if (applied && promo.code !== '') body.promoCode = promo.code;
      const res = await api<{ order?: { id?: string | number }; id?: string | number }>('/api/orders', { method: 'POST', headers: { 'Idempotency-Key': idemKey() }, body: JSON.stringify(body) });
      const orderId = res.order?.id ?? res.id;
      if (orderId === undefined || orderId === null || orderId === '') throw new Error('API did not return an order id');
      cart.clear();
      toast('Order placed — tracking your food', 'ok');
      await navigate(`../track/${encodeURIComponent(String(orderId))}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to place order';
      setError(msg);
      toast(msg, 'err');
    } finally {
      setPlacing(false);
    }
  }

  if (lines.length === 0) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <h1 className="text-xl font-extrabold">Your cart is empty</h1>
        <p className="mt-2 text-sm text-stone-500">Browse stores and add something tasty.</p>
        <Link to=".." className="mt-4 inline-block rounded-full px-4 py-2 text-sm font-bold text-white" style={ACCENT}>← Browse stores</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link to=".." className="rounded-full bg-white px-3 py-1.5 text-sm font-bold ring-1 ring-stone-200">← Keep browsing</Link>
        <h1 className="text-xl font-extrabold">Checkout</h1>
      </div>

      <div className="card p-4">
        <h2 className="text-sm font-extrabold">{storeName ?? 'Your cart'}</h2>
        <div className="mt-3 space-y-3">
          {lines.map((l) => (
            <div key={l.key} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{l.qty}× {l.name}</p>
                {l.choiceLabels.map((c) => <p key={c} className="truncate text-xs text-stone-500">{c}</p>)}
                <p className="text-xs font-bold text-stone-500">{peso(l.unitPrice)} each</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => cart.setQty(l.key, l.qty - 1)} className="h-7 w-7 rounded-full bg-stone-100 text-sm font-extrabold">−</button>
                <span className="w-5 text-center text-sm font-extrabold">{l.qty}</span>
                <button type="button" onClick={() => cart.setQty(l.key, l.qty + 1)} className="h-7 w-7 rounded-full bg-stone-100 text-sm font-extrabold">+</button>
              </div>
              <span className="w-16 text-right text-sm font-extrabold">{peso(l.unitPrice * l.qty)}</span>
              <button type="button" onClick={() => cart.removeLine(l.key)} className="rounded-full px-2 py-1 text-xs font-bold text-red-600 hover:bg-red-50">Remove</button>
            </div>
          ))}
        </div>
      </div>

      <div className="card flex items-center gap-2 p-4 text-sm">
        <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-extrabold text-emerald-700 ring-1 ring-emerald-200">📍 {CENTRIO_LAT.toFixed(4)}, {CENTRIO_LNG.toFixed(4)} · Centrio area — fixed for POC</span>
      </div>

      <div className="card space-y-2 p-4">
        <h2 className="text-sm font-extrabold">Promo code</h2>
        <div className="flex gap-2">
          <input value={promoCode} onChange={(e) => { setPromoCode(e.target.value); setApplied(false); }} placeholder="KAON20 or FREESHIP"
            className="flex-1 rounded-full border border-stone-200 bg-stone-50 px-4 py-2 text-sm font-bold uppercase outline-none focus:border-emerald-500" />
          <button type="button" onClick={() => setApplied(true)} className="rounded-full bg-stone-900 px-4 py-2 text-sm font-bold text-white">Apply</button>
        </div>
        {applied && promo.message !== '' && <p className={`text-xs font-bold ${promo.ok ? 'text-emerald-700' : 'text-red-600'}`}>{promo.message}</p>}
        <p className="text-[11px] text-stone-400">Server revalidates promos at order time.</p>
      </div>

      <div className="card space-y-3 p-4">
        <h2 className="text-sm font-extrabold">Payment (mock)</h2>
        {(Object.keys(PAY_LABELS) as PayMethod[]).map((m) => (
          <label key={m} className={`flex cursor-pointer items-center gap-2 rounded-2xl border px-3 py-2.5 text-sm font-bold ${method === m ? 'border-emerald-500 bg-emerald-50' : 'border-stone-200'}`}>
            <input type="radio" name="pay" checked={method === m} onChange={() => setMethod(m)} />{PAY_LABELS[m]}
          </label>
        ))}
        {method === 'GCash-mock' && <input value={gcash} onChange={(e) => setGcash(e.target.value)} inputMode="tel" placeholder="GCash number e.g. 0917…" className={FIELD} />}
        {method === 'Card-mock' && (
          <div className="grid grid-cols-2 gap-2">
            <input value={card} onChange={(e) => setCard(e.target.value)} inputMode="numeric" placeholder="Card number" className={`${FIELD} col-span-2`} />
            <input value={exp} onChange={(e) => setExp(e.target.value)} placeholder="MM/YY" className={FIELD} />
            <input value={cvc} onChange={(e) => setCvc(e.target.value)} inputMode="numeric" placeholder="CVC" className={FIELD} />
          </div>
        )}
      </div>

      <div className="card space-y-1.5 p-4 text-sm font-semibold">
        <Row k="Subtotal" v={peso(subtotal)} />
        <Row k="Discount" v={`−${peso(promo.ok ? promo.discount : 0)}`} />
        <Row k="Delivery fee" v={fee === 0 ? 'FREE' : peso(fee)} />
        <Row k="Total" v={peso(total)} bold />
      </div>

      {error !== '' && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}

      <button type="button" onClick={placeOrder} disabled={placing} className="w-full rounded-full px-4 py-3 text-sm font-extrabold text-white disabled:opacity-60" style={ACCENT}>
        {placing ? 'Placing order…' : `Place order · ${peso(total)}`}
      </button>
    </div>
  );
}
