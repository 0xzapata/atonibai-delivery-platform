import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../../lib/api';
import { CENTRIO_LAT, CENTRIO_LNG } from './geo';
import { cartSubtotal, useBuyerCart } from './cart';
import { evaluatePromo } from './promos';
import { toast } from './toast';
import { peso } from './types';

type PayMethod = 'COD' | 'GCash-mock' | 'Card-mock';

function newIdempotencyKey(): string {
  try {
    const c = globalThis.crypto as unknown as { randomUUID?: () => string } | undefined;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  } catch {
    // fall through to the random fallback below
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export default function CheckoutPage() {
  const navigate = useNavigate();
  const storeId = useBuyerCart((s) => s.storeId);
  const storeName = useBuyerCart((s) => s.storeName);
  const deliveryFeeBase = useBuyerCart((s) => s.deliveryFee);
  const lines = useBuyerCart((s) => s.lines);
  const setQty = useBuyerCart((s) => s.setQty);
  const removeLine = useBuyerCart((s) => s.removeLine);
  const clear = useBuyerCart((s) => s.clear);

  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);
  const [method, setMethod] = useState<PayMethod>('COD');
  const [gcashNumber, setGcashNumber] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState('');

  const subtotal = cartSubtotal(lines);
  const promo = useMemo(
    () => (promoApplied ? evaluatePromo(promoCode, subtotal) : evaluatePromo('', subtotal)),
    [promoApplied, promoCode, subtotal],
  );
  const fee = promo.freeDelivery && promo.ok ? 0 : (deliveryFeeBase ?? 49);
  const total = Math.max(0, subtotal - (promo.ok ? promo.discount : 0) + (lines.length > 0 ? fee : 0));

  async function placeOrder() {
    setError('');
    if (!storeId || lines.length === 0) {
      setError('Your cart is empty.');
      return;
    }
    if (promoApplied && !promo.ok) {
      setError(promo.message);
      return;
    }
    if (method === 'GCash-mock' && gcashNumber.replace(/\D/g, '').length < 7) {
      setError('Enter a GCash number (mock — any 7+ digits).');
      return;
    }
    if (method === 'Card-mock') {
      if (cardNumber.replace(/\D/g, '').length < 12) {
        setError('Enter a card number (mock — any 12+ digits).');
        return;
      }
      if (cardExpiry.trim() === '' || cardCvc.trim() === '') {
        setError('Enter card expiry and CVC (mock values are fine).');
        return;
      }
    }
    setPlacing(true);
    try {
      const body: Record<string, unknown> = {
        storeId,
        items: lines.map((l) => ({ itemId: l.itemId, qty: l.qty, choices: l.choiceIds })),
        buyerLat: CENTRIO_LAT,
        buyerLng: CENTRIO_LNG,
        paymentMethod: method,
      };
      if (promoApplied && promo.code !== '') body.promoCode = promo.code;
      const res = await api<{ order?: { id?: string | number }; id?: string | number }>(
        '/api/orders',
        {
          method: 'POST',
          headers: { 'Idempotency-Key': newIdempotencyKey() },
          body: JSON.stringify(body),
        },
      );
      const orderId = res.order?.id ?? res.id;
      if (orderId === undefined || orderId === null || orderId === '') {
        throw new Error('API did not return an order id');
      }
      clear();
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
        <Link
          to=".."
          className="mt-4 inline-block rounded-full px-4 py-2 text-sm font-bold text-white"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          ← Browse stores
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link to=".." className="rounded-full bg-white px-3 py-1.5 text-sm font-bold ring-1 ring-stone-200">
          ← Keep browsing
        </Link>
        <h1 className="text-xl font-extrabold">Checkout</h1>
      </div>

      <div className="card p-4">
        <h2 className="text-sm font-extrabold">{storeName ?? 'Your cart'}</h2>
        <div className="mt-3 space-y-3">
          {lines.map((l) => (
            <div key={l.key} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">
                  {l.qty}× {l.name}
                </p>
                {l.choiceLabels.map((c) => (
                  <p key={c} className="truncate text-xs text-stone-500">
                    {c}
                  </p>
                ))}
                <p className="text-xs font-bold text-stone-500">{peso(l.unitPrice)} each</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setQty(l.key, l.qty - 1)}
                  className="h-7 w-7 rounded-full bg-stone-100 text-sm font-extrabold"
                >
                  −
                </button>
                <span className="w-5 text-center text-sm font-extrabold">{l.qty}</span>
                <button
                  type="button"
                  onClick={() => setQty(l.key, l.qty + 1)}
                  className="h-7 w-7 rounded-full bg-stone-100 text-sm font-extrabold"
                >
                  +
                </button>
              </div>
              <span className="w-16 text-right text-sm font-extrabold">{peso(l.unitPrice * l.qty)}</span>
              <button
                type="button"
                onClick={() => removeLine(l.key)}
                className="rounded-full px-2 py-1 text-xs font-bold text-red-600 hover:bg-red-50"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="card flex items-center gap-2 p-4 text-sm">
        <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-extrabold text-emerald-700 ring-1 ring-emerald-200">
          📍 {CENTRIO_LAT.toFixed(4)}, {CENTRIO_LNG.toFixed(4)} · Centrio area — fixed for POC
        </span>
      </div>

      <div className="card space-y-2 p-4">
        <h2 className="text-sm font-extrabold">Promo code</h2>
        <div className="flex gap-2">
          <input
            value={promoCode}
            onChange={(e) => {
              setPromoCode(e.target.value);
              setPromoApplied(false);
            }}
            placeholder="KAON20 or FREESHIP"
            className="flex-1 rounded-full border border-stone-200 bg-stone-50 px-4 py-2 text-sm font-bold uppercase outline-none focus:border-emerald-500"
          />
          <button
            type="button"
            onClick={() => setPromoApplied(true)}
            className="rounded-full bg-stone-900 px-4 py-2 text-sm font-bold text-white"
          >
            Apply
          </button>
        </div>
        {promoApplied && promo.message !== '' && (
          <p className={`text-xs font-bold ${promo.ok ? 'text-emerald-700' : 'text-red-600'}`}>
            {promo.message}
          </p>
        )}
        <p className="text-[11px] text-stone-400">Server revalidates promos at order time.</p>
      </div>

      <div className="card space-y-3 p-4">
        <h2 className="text-sm font-extrabold">Payment (mock)</h2>
        {(['COD', 'GCash-mock', 'Card-mock'] as PayMethod[]).map((m) => (
          <label
            key={m}
            className={`flex cursor-pointer items-center gap-2 rounded-2xl border px-3 py-2.5 text-sm font-bold ${
              method === m ? 'border-emerald-500 bg-emerald-50' : 'border-stone-200'
            }`}
          >
            <input type="radio" name="pay" checked={method === m} onChange={() => setMethod(m)} />
            {m === 'COD' ? 'Cash on delivery' : m === 'GCash-mock' ? 'GCash (mock)' : 'Card (mock)'}
          </label>
        ))}
        {method === 'GCash-mock' && (
          <input
            value={gcashNumber}
            onChange={(e) => setGcashNumber(e.target.value)}
            inputMode="tel"
            placeholder="GCash number e.g. 0917…"
            className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
        )}
        {method === 'Card-mock' && (
          <div className="grid grid-cols-2 gap-2">
            <input
              value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value)}
              inputMode="numeric"
              placeholder="Card number"
              className="col-span-2 rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            />
            <input
              value={cardExpiry}
              onChange={(e) => setCardExpiry(e.target.value)}
              placeholder="MM/YY"
              className="rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            />
            <input
              value={cardCvc}
              onChange={(e) => setCardCvc(e.target.value)}
              inputMode="numeric"
              placeholder="CVC"
              className="rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            />
          </div>
        )}
      </div>

      <div className="card space-y-1.5 p-4 text-sm font-semibold">
        <div className="flex justify-between text-stone-600">
          <span>Subtotal</span>
          <span>{peso(subtotal)}</span>
        </div>
        <div className="flex justify-between text-stone-600">
          <span>Discount</span>
          <span>−{peso(promo.ok ? promo.discount : 0)}</span>
        </div>
        <div className="flex justify-between text-stone-600">
          <span>Delivery fee</span>
          <span>{fee === 0 ? 'FREE' : peso(fee)}</span>
        </div>
        <div className="flex justify-between border-t border-stone-100 pt-2 text-base font-extrabold">
          <span>Total</span>
          <span>{peso(total)}</span>
        </div>
      </div>

      {error !== '' && (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>
      )}

      <button
        type="button"
        onClick={placeOrder}
        disabled={placing}
        className="w-full rounded-full px-4 py-3 text-sm font-extrabold text-white disabled:opacity-60"
        style={{ backgroundColor: 'var(--accent)' }}
      >
        {placing ? 'Placing order…' : `Place order · ${peso(total)}`}
      </button>
    </div>
  );
}
