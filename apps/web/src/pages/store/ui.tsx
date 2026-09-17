// Shared store-owner chrome: shell, switcher, badges, toast. Light theme + `.card`.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Link, useLocation } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { usePersona } from '../../lib/persona';
import {
  STORE_ID_STORAGE_KEY,
  fetchStoresRaw,
  normalizeStores,
} from './storeApi';
import type { OrderStatus, StatusGroup } from './types';

// ---------- formatting ----------

export function formatPeso(v: unknown): string {
  const n = typeof v === 'number' ? v : Number(String(v ?? 0).replace(/[^0-9.\-]/g, ''));
  const safe = Number.isFinite(n) ? n : 0;
  try {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
    }).format(safe);
  } catch {
    return `₱${safe.toFixed(2)}`;
  }
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
  } catch {
    return String(iso);
  }
}

// ---------- status groups ----------

export function groupForStatus(status: OrderStatus): StatusGroup {
  switch (status) {
    case 'placed':
    case 'store_accepted':
      return 'new';
    case 'preparing':
      return 'preparing';
    case 'ready':
      return 'ready';
    case 'rider_assigned':
    case 'picked_up':
    case 'delivering':
      return 'on_the_way';
    default:
      return 'done';
  }
}

export const GROUP_LABELS: Record<StatusGroup, string> = {
  new: 'New',
  preparing: 'Preparing',
  ready: 'Ready',
  on_the_way: 'On the way',
  done: 'Done',
};

const BADGE_STYLES: Record<string, string> = {
  placed: 'bg-amber-100 text-amber-800',
  store_accepted: 'bg-sky-100 text-sky-800',
  preparing: 'bg-violet-100 text-violet-800',
  ready: 'bg-emerald-100 text-emerald-800',
  rider_assigned: 'bg-indigo-100 text-indigo-800',
  picked_up: 'bg-indigo-100 text-indigo-800',
  delivering: 'bg-blue-100 text-blue-800',
  delivered: 'bg-stone-200 text-stone-700',
  cancelled: 'bg-red-100 text-red-700',
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const cls = BADGE_STYLES[status] ?? 'bg-stone-200 text-stone-700';
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${cls}`}
      title={status}
    >
      {status.replaceAll('_', ' ')}
    </span>
  );
}

// ---------- toast (tiny, local) ----------

interface ToastItem {
  id: number;
  message: string;
  kind: 'ok' | 'err';
}

const ToastCtx = createContext<{ push: (message: string, kind?: 'ok' | 'err') => void }>({
  push: () => {},
});

export function useToast() {
  return useContext(ToastCtx);
}

let toastSeq = 1;

function ToastViewport({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-72 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`card pointer-events-auto px-3 py-2 text-sm font-semibold ${
            t.kind === 'err' ? 'border-red-200 text-red-700' : 'text-stone-800'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

// ---------- store selection (first store by default) ----------

export function readStoredStoreId(): string | null {
  try {
    return window.localStorage.getItem(STORE_ID_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function useStores() {
  return useQuery({
    queryKey: ['stores'],
    queryFn: fetchStoresRaw,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });
}

export function useSelectedStore(): {
  stores: Array<{ id: string | number; name: string }>;
  selectedId: string | null;
  selectedName: string | null;
  setSelectedId: (id: string) => void;
  isLoading: boolean;
} {
  const storesQuery = useStores();
  const stores = useMemo(
    () => normalizeStores(storesQuery.data),
    [storesQuery.data],
  );
  const [overrideId, setOverrideId] = useState<string | null>(() => readStoredStoreId());

  const selectedId = useMemo(() => {
    if (stores.length === 0) return overrideId;
    if (overrideId && stores.some((s) => String(s.id) === overrideId)) return overrideId;
    return String(stores[0].id);
  }, [stores, overrideId]);

  const setSelectedId = useCallback((id: string) => {
    setOverrideId(id);
    try {
      window.localStorage.setItem(STORE_ID_STORAGE_KEY, id);
    } catch {
      // ignore (private mode)
    }
  }, []);

  const selectedName =
    stores.find((s) => String(s.id) === selectedId)?.name ?? null;

  return {
    stores,
    selectedId,
    selectedName,
    setSelectedId,
    isLoading: storesQuery.isPending,
  };
}

function StoreSwitcher() {
  const { stores, selectedId, setSelectedId, isLoading } = useSelectedStore();
  if (isLoading) {
    return (
      <span className="rounded-full bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-500">
        Loading stores…
      </span>
    );
  }
  if (stores.length === 0) {
    return (
      <span className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700">
        No stores (API down?)
      </span>
    );
  }
  return (
    <label className="flex items-center gap-2 text-xs font-semibold text-stone-500">
      <span className="hidden sm:inline">Store</span>
      <select
        aria-label="Select store"
        className="max-w-44 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-stone-800 sm:max-w-56"
        value={selectedId ?? ''}
        onChange={(e) => setSelectedId(e.target.value)}
      >
        {stores.map((s) => (
          <option key={String(s.id)} value={String(s.id)}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}

// ---------- shell ----------

function ShellNav() {
  const { pathname } = useLocation();
  const link = (to: string, label: string) => {
    const active =
      to === '/store' ? pathname === '/store' : pathname.startsWith(to);
    return (
      <Link
        key={to}
        to={to}
        className={`rounded-full px-3 py-1.5 text-sm font-bold ${
          active ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-200/60'
        }`}
      >
        {label}
      </Link>
    );
  };
  return (
    <nav className="flex items-center gap-1">
      {link('/store', 'Dashboard')}
      {link('/store/orders', 'Orders')}
      {link('/store/menu', 'Menu')}
    </nav>
  );
}

export function StoreShell({ children }: { children: ReactNode }) {
  const [persona, setPersona] = usePersona();
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((message: string, kind: 'ok' | 'err' = 'ok') => {
    const id = toastSeq++;
    setToasts((prev) => [...prev.slice(-3), { id, message, kind }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  useEffect(() => {
    if (persona !== 'store_owner') {
      try {
        setPersona('store_owner');
      } catch {
        // ignore
      }
    }
    // Only run once per mount — persona identity is stable enough here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ToastCtx.Provider value={{ push }}>
      <div className="space-y-4">
        <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/" className="text-base font-extrabold tracking-tight">
              Kaon<span style={{ color: 'var(--accent)' }}>CDO</span>
              <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 align-middle text-xs font-bold text-stone-500">
                Store
              </span>
            </Link>
            <ShellNav />
          </div>
          <div className="flex items-center gap-2">
            <StoreSwitcher />
          </div>
        </div>
        {children}
        <ToastViewport toasts={toasts} />
      </div>
    </ToastCtx.Provider>
  );
}

export function PageHeader({
  title,
  blurb,
  right,
}: {
  title: string;
  blurb?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">{title}</h1>
        {blurb ? <p className="mt-1 text-sm text-stone-500">{blurb}</p> : null}
      </div>
      {right ? <div className="flex items-center gap-2">{right}</div> : null}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-center text-sm font-semibold text-stone-500">
      {message}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-center">
      <p className="text-sm font-bold text-red-700">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-full bg-stone-900 px-4 py-1.5 text-xs font-bold text-white"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}
