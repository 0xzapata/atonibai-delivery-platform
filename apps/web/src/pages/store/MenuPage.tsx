// Menu editor: categories + items, availability toggle, inline price edit (save on blur).
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MenuItem } from './types';
import {
  fetchMenu,
  menuItemAvailable,
  menuItemPrice,
  menuItemsOf,
  patchMenuItem,
} from './storeApi';
import {
  EmptyState,
  ErrorState,
  PageHeader,
  StoreShell,
  formatPeso,
  useSelectedStore,
  useToast,
} from './ui';

function AvailabilitySwitch({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${
        checked ? '' : 'bg-stone-300'
      }`}
      style={checked ? { backgroundColor: 'var(--accent)' } : undefined}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
          checked ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}

function PriceInput({
  initial,
  disabled,
  onSave,
}: {
  initial: number;
  disabled?: boolean;
  onSave: (next: number) => void;
}) {
  const [text, setText] = useState(String(initial));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) setText(String(initial));
  }, [initial, dirty]);

  const commit = () => {
    if (!dirty) return;
    setDirty(false);
    const n = Number(String(text).replace(/[^0-9.\-]/g, ''));
    if (!Number.isFinite(n) || n < 0) {
      setText(String(initial));
      return;
    }
    if (n !== initial) onSave(n);
    else setText(String(initial));
  };

  return (
    <span className="flex items-center gap-1 text-sm font-bold">
      <span className="text-stone-400">₱</span>
      <input
        aria-label="Price in pesos"
        inputMode="decimal"
        disabled={disabled}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setDirty(true);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setText(String(initial));
            setDirty(false);
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="w-24 rounded-xl border border-stone-200 bg-white px-2 py-1 text-sm font-bold"
      />
    </span>
  );
}

function MenuRow({ item }: { item: MenuItem }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const available = menuItemAvailable(item);
  const price = menuItemPrice(item);

  const mutation = useMutation({
    mutationFn: (patch: { is_available?: boolean; price?: number }) =>
      patchMenuItem(item.id, patch),
    onSuccess: (_data, vars) => {
      if (typeof vars.is_available === 'boolean') {
        toast.push(
          vars.is_available ? `${item.name} available` : `${item.name} marked out of stock`,
        );
      } else {
        toast.push(`${item.name} price → ${formatPeso(vars.price ?? price)}`);
      }
      void queryClient.invalidateQueries({ queryKey: ['store', 'menu'] });
    },
    onError: (e) => {
      toast.push(e instanceof Error ? e.message : 'Menu update failed', 'err');
    },
  });

  return (
    <li
      className={`flex flex-col gap-2 rounded-2xl border p-3 sm:flex-row sm:items-center sm:justify-between ${
        available ? 'border-stone-200 bg-white' : 'border-stone-200 bg-stone-100'
      }`}
    >
      <div className={`min-w-0 ${available ? '' : 'opacity-60'}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`font-bold ${available ? '' : 'text-stone-500 line-through'}`}>
            {item.name}
          </span>
          {available ? null : (
            <span className="rounded-full bg-stone-300 px-2 py-0.5 text-xs font-bold text-stone-700">
              Out of stock
            </span>
          )}
        </div>
        {item.description ? (
          <p className="mt-0.5 truncate text-xs font-semibold text-stone-500">
            {item.description}
          </p>
        ) : null}
        <p className="mt-0.5 text-sm font-extrabold">{formatPeso(price)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <PriceInput
          initial={price}
          disabled={mutation.isPending}
          onSave={(next) => mutation.mutate({ price: next })}
        />
        <AvailabilitySwitch
          checked={available}
          disabled={mutation.isPending}
          label={`${item.name} availability`}
          onChange={(next) => mutation.mutate({ is_available: next })}
        />
      </div>
    </li>
  );
}

export default function MenuPage() {
  const { stores, selectedId, selectedName } = useSelectedStore();
  const menuQuery = useQuery({
    queryKey: ['store', 'menu', selectedId],
    queryFn: () => fetchMenu(selectedId ?? ''),
    enabled: selectedId !== null && selectedId.length > 0,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const categories = menuQuery.data ?? [];
  const itemCount = categories.reduce((n, c) => n + menuItemsOf(c).length, 0);

  return (
    <StoreShell>
      <PageHeader
        title={selectedName ? `${selectedName} — Menu` : 'Menu editor'}
        blurb={
          stores.length > 1
            ? 'Editing the store selected above. Toggle availability, click a price to edit (saves on blur).'
            : 'Toggle availability, click a price to edit (saves on blur).'
        }
        right={
          <span className="rounded-full bg-stone-100 px-3 py-1.5 text-xs font-bold text-stone-500">
            {itemCount} item(s)
          </span>
        }
      />
      {menuQuery.isPending ? (
        <p className="text-sm font-semibold text-stone-500">Loading menu…</p>
      ) : menuQuery.isError ? (
        <ErrorState
          message="Menu unavailable — is the API running at localhost:3001?"
          onRetry={() => void menuQuery.refetch()}
        />
      ) : categories.length === 0 ? (
        <EmptyState message="No menu categories returned for this store yet." />
      ) : (
        <div className="space-y-3">
          {categories.map((cat) => {
            const items = menuItemsOf(cat);
            return (
              <section key={String(cat.id)} className="card p-4">
                <h2 className="text-base font-extrabold">
                  {cat.name ?? cat.title ?? 'Category'}{' '}
                  <span className="ml-1 rounded-full bg-stone-100 px-2 py-0.5 align-middle text-xs font-bold text-stone-500">
                    {items.length}
                  </span>
                </h2>
                {items.length === 0 ? (
                  <p className="mt-2 text-sm font-semibold text-stone-400">
                    No items in this category.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {items.map((it) => (
                      <MenuRow key={String(it.id)} item={it} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </StoreShell>
  );
}
