import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { apiGet, type StoresPayload } from '../../lib/api';
import { cartCount, cartSubtotal, useBuyerCart } from './cart';
import { toast } from './toast';
import {
  imgFallback,
  normalizeMenu,
  normalizeStores,
  peso,
  type MenuItem,
  type MenuOption,
} from './types';

function optionPrice(option: MenuOption, selected: string[]): number {
  return option.choices
    .filter((c) => selected.includes(c.id))
    .reduce((n, c) => n + c.price_delta, 0);
}

function ItemModal({
  item,
  storeId,
  storeName,
  deliveryFee,
  onClose,
}: {
  item: MenuItem;
  storeId: string;
  storeName: string;
  deliveryFee: number | null;
  onClose: () => void;
}) {
  const [qty, setQty] = useState(1);
  const [sel, setSel] = useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {};
    for (const o of item.options) init[o.id] = [];
    return init;
  });
  const [error, setError] = useState('');

  const addLine = useBuyerCart((s) => s.addLine);
  const existingStoreId = useBuyerCart((s) => s.storeId);

  const missing = item.options.filter((o) => o.required && (sel[o.id] ?? []).length === 0);
  const unit =
    item.price +
    item.options.reduce((n, o) => n + optionPrice(o, sel[o.id] ?? []), 0);

  function toggle(option: MenuOption, choiceId: string) {
    setSel((prev) => {
      const cur = prev[option.id] ?? [];
      if (option.multi) {
        return {
          ...prev,
          [option.id]: cur.includes(choiceId)
            ? cur.filter((c) => c !== choiceId)
            : [...cur, choiceId],
        };
      }
      return { ...prev, [option.id]: cur.includes(choiceId) ? [] : [choiceId] };
    });
  }

  function submit() {
    if (missing.length > 0) {
      setError(`Please choose: ${missing.map((o) => o.name).join(', ')}`);
      return;
    }
    if (
      existingStoreId !== null &&
      existingStoreId !== storeId &&
      !window.confirm('Your cart has items from another store. Replace it with this item?')
    ) {
      return;
    }
    const choiceIds = item.options.flatMap((o) => sel[o.id] ?? []);
    const byId = new Map(item.options.flatMap((o) => o.choices.map((c) => [c.id, c] as const)));
    const choiceLabels = item.options
      .filter((o) => (sel[o.id] ?? []).length > 0)
      .map(
        (o) =>
          `${o.name}: ${(sel[o.id] ?? []).map((id) => byId.get(id)?.name ?? id).join(', ')}`,
      );
    const result = addLine(
      {
        storeId,
        storeName,
        deliveryFee,
        itemId: item.id,
        name: item.name,
        image: item.image,
        basePrice: item.price,
        choiceIds,
        choiceLabels,
        unitPrice: unit,
      },
      qty,
    );
    toast(result === 'replaced' ? 'Cart replaced with this item' : `Added ${qty}× ${item.name}`, 'ok');
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold">{item.name}</h2>
            {item.description && <p className="mt-1 text-sm text-stone-500">{item.description}</p>}
            <p className="mt-1 text-sm font-extrabold" style={{ color: 'var(--accent)' }}>
              {peso(item.price)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-stone-100 px-3 py-1.5 text-sm font-bold"
          >
            ✕
          </button>
        </div>

        {item.image && (
          <img
            src={item.image}
            alt={item.name}
            loading="lazy"
            onError={(e) => {
              e.currentTarget.src = imgFallback(item.id);
            }}
            className="mt-3 h-40 w-full rounded-2xl object-cover"
          />
        )}

        {item.options.map((o) => (
          <fieldset key={o.id} className="mt-4">
            <legend className="text-sm font-extrabold">
              {o.name}{' '}
              <span className="ml-1 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-bold text-stone-500">
                {o.required ? 'Required' : 'Optional'} · {o.multi ? 'Pick any' : 'Pick one'}
              </span>
            </legend>
            <div className="mt-2 space-y-1.5">
              {!o.required && !o.multi && (
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-stone-200 px-3 py-2 text-sm">
                  <input
                    type="radio"
                    name={o.id}
                    checked={(sel[o.id] ?? []).length === 0}
                    onChange={() => setSel((p) => ({ ...p, [o.id]: [] }))}
                  />
                  <span className="text-stone-500">None</span>
                </label>
              )}
              {o.choices.map((c) => {
                const checked = (sel[o.id] ?? []).includes(c.id);
                return (
                  <label
                    key={c.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${
                      checked ? 'border-emerald-500 bg-emerald-50' : 'border-stone-200'
                    }`}
                  >
                    <input
                      type={o.multi ? 'checkbox' : 'radio'}
                      name={o.id}
                      checked={checked}
                      onChange={() => toggle(o, c.id)}
                    />
                    <span className="flex-1">{c.name}</span>
                    {c.price_delta !== 0 && (
                      <span className="text-xs font-bold text-stone-500">
                        {c.price_delta > 0 ? '+' : ''}
                        {peso(c.price_delta)}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}

        {error !== '' && (
          <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</p>
        )}

        <div className="mt-4 flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-full bg-stone-100 px-2 py-1">
            <button
              type="button"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="h-7 w-7 rounded-full bg-white text-base font-extrabold"
            >
              −
            </button>
            <span className="w-6 text-center text-sm font-extrabold">{qty}</span>
            <button
              type="button"
              onClick={() => setQty((q) => Math.min(10, q + 1))}
              className="h-7 w-7 rounded-full bg-white text-base font-extrabold"
            >
              +
            </button>
          </div>
          <button
            type="button"
            onClick={submit}
            className="flex-1 rounded-full px-4 py-2.5 text-sm font-extrabold text-white"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            Add · {peso(unit * qty)}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function StorePage() {
  const { id = '' } = useParams();
  const storeId = decodeURIComponent(id);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [catFilter, setCatFilter] = useState<string | null>(null);
  const lines = useBuyerCart((s) => s.lines);

  const storesQuery = useQuery({
    queryKey: ['buyer', 'stores'],
    queryFn: () => apiGet<StoresPayload>('/api/stores'),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const menuQuery = useQuery({
    queryKey: ['buyer', 'menu', storeId],
    queryFn: () => apiGet<unknown>(`/api/stores/${encodeURIComponent(storeId)}/menu`),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const store = useMemo(
    () => normalizeStores(storesQuery.data).find((s) => s.id === storeId),
    [storesQuery.data, storeId],
  );
  const categories = useMemo(() => normalizeMenu(menuQuery.data), [menuQuery.data]);
  const activeItem: MenuItem | null = useMemo(() => {
    if (!activeId) return null;
    for (const c of categories) {
      const found = c.items.find((i) => i.id === activeId);
      if (found) return found;
    }
    return null;
  }, [categories, activeId]);

  const shownCats = catFilter ? categories.filter((c) => c.id === catFilter) : categories;
  const count = cartCount(lines);
  const subtotal = cartSubtotal(lines);

  function scrollToCat(catId: string) {
    setCatFilter(null);
    requestAnimationFrame(() => {
      document.getElementById(`buyer-cat-${catId}`)?.scrollIntoView({ behavior: 'smooth' });
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link to=".." className="rounded-full bg-white px-3 py-1.5 text-sm font-bold ring-1 ring-stone-200">
          ← Stores
        </Link>
        <Link
          to="../checkout"
          className="rounded-full px-4 py-2 text-sm font-bold text-white"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          Cart{count > 0 ? ` (${count} · ${peso(subtotal)})` : ''}
        </Link>
      </div>

      <div className="card overflow-hidden">
        {store?.image && (
          <img
            src={store.image}
            alt={store.name}
            onError={(e) => {
              e.currentTarget.src = imgFallback(store.id);
            }}
            className="h-40 w-full object-cover sm:h-52"
          />
        )}
        <div className="p-4">
          <h1 className="text-xl font-extrabold">{store?.name ?? 'Store'}</h1>
          <p className="mt-0.5 text-xs font-semibold text-stone-500">
            {store?.cuisine ?? ''} · ★ {store?.rating?.toFixed(1) ?? 'New'} ·{' '}
            {peso(store?.delivery_fee ?? 49)} fee
          </p>
        </div>
      </div>

      {menuQuery.isPending && <div className="card animate-pulse p-6 text-sm text-stone-500">Loading menu…</div>}

      {menuQuery.isError && (
        <div className="card p-6 text-center">
          <h2 className="text-base font-extrabold">Couldn&apos;t load the menu</h2>
          <p className="mt-1 text-sm text-stone-500">
            Expected <code>GET /api/stores/:id/menu</code>. Retry once the API is up.
          </p>
          <button
            type="button"
            onClick={() => menuQuery.refetch()}
            className="mt-4 rounded-full px-4 py-2 text-sm font-bold text-white"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            Retry
          </button>
        </div>
      )}

      {menuQuery.isSuccess && (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setCatFilter(null)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
                catFilter === null ? 'text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200'
              }`}
              style={catFilter === null ? { backgroundColor: 'var(--accent)' } : undefined}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => scrollToCat(c.id)}
                className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-stone-600 ring-1 ring-stone-200"
              >
                {c.name}
              </button>
            ))}
          </div>

          {shownCats.map((c) => (
            <section key={c.id} id={`buyer-cat-${c.id}`} className="scroll-mt-20 space-y-3">
              <h2 className="text-base font-extrabold">{c.name}</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {c.items.map((item) => {
                  const available = item.is_available;
                  return (
                    <div
                      key={item.id}
                      className={`card flex gap-3 overflow-hidden p-3 ${available ? '' : 'opacity-60'}`}
                    >
                      <img
                        src={item.image ?? imgFallback(`${storeId}-${item.id}`)}
                        alt={item.name}
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.src = imgFallback(`${storeId}-${item.id}`);
                        }}
                        className="h-20 w-20 shrink-0 rounded-xl object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate text-sm font-extrabold">{item.name}</h3>
                          {!available && (
                            <span className="shrink-0 rounded-full bg-stone-200 px-2 py-0.5 text-[10px] font-extrabold text-stone-600">
                              Unavailable
                            </span>
                          )}
                        </div>
                        {item.description && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-stone-500">{item.description}</p>
                        )}
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <span className="text-sm font-extrabold">{peso(item.price)}</span>
                          <button
                            type="button"
                            disabled={!available}
                            onClick={() => setActiveId(item.id)}
                            className="rounded-full px-3 py-1.5 text-xs font-extrabold text-white disabled:bg-stone-300"
                            style={available ? { backgroundColor: 'var(--accent)' } : undefined}
                          >
                            {item.options.length > 0 ? 'Customize' : 'Add'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </>
      )}

      {activeItem && (
        <ItemModal
          item={activeItem}
          storeId={storeId}
          storeName={store?.name ?? 'Store'}
          deliveryFee={store?.delivery_fee ?? 49}
          onClose={() => setActiveId(null)}
        />
      )}
    </div>
  );
}
