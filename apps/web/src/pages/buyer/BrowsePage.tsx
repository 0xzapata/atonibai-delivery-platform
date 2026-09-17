import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { apiGet, type StoresPayload } from '../../lib/api';
import { distanceKm, mockEtaMin } from './geo';
import { cartCount, useBuyerCart } from './cart';
import { imgFallback, normalizeStores, peso, type Store } from './types';

type SortKey = 'rating' | 'fee' | 'eta';
const SORT_LABELS: Record<SortKey, string> = { rating: 'Top rated', fee: 'Lowest fee', eta: 'Fastest ETA' };
const feeOf = (s: Store) => s.delivery_fee ?? 49;
const SORTERS: Record<SortKey, (a: Store, b: Store) => number> = {
  rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0),
  fee: (a, b) => feeOf(a) - feeOf(b),
  eta: (a, b) => mockEtaMin(a.lat, a.lng) - mockEtaMin(b.lat, b.lng),
};
const ACCENT = { backgroundColor: 'var(--accent)' } as const;

function Chip({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={active ? ACCENT : undefined}
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${active ? 'text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200'}`}>
      {children}
    </button>
  );
}

function StoreCard({ s }: { s: Store }) {
  const km = distanceKm(s.lat, s.lng);
  const open = s.is_open !== false;
  return (
    <Link to={`s/${encodeURIComponent(s.id)}`} className="card group overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative h-36 bg-stone-100">
        <img src={s.image ?? imgFallback(s.id)} alt={s.name} loading="lazy"
          onError={(e) => { e.currentTarget.src = imgFallback(s.id); }} className="h-full w-full object-cover" />
        <span className={`absolute top-2 left-2 rounded-full px-2.5 py-1 text-[11px] font-extrabold text-white ${open ? 'bg-emerald-600' : 'bg-stone-700'}`}>
          {open ? 'Open' : 'Closed'}
        </span>
      </div>
      <div className="p-4">
        <h2 className="font-extrabold group-hover:underline">{s.name}</h2>
        <p className="mt-0.5 text-xs font-semibold text-stone-500">{s.cuisine}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold text-stone-600">
          <span>★ {s.rating !== null ? s.rating.toFixed(1) : 'New'}</span>
          <span>{peso(feeOf(s))} fee</span>
          <span>~{mockEtaMin(s.lat, s.lng)} min</span>
          {km !== null && <span>{km.toFixed(1)} km</span>}
        </div>
      </div>
    </Link>
  );
}

export default function BrowsePage() {
  const [query, setQuery] = useState('');
  const [cuisine, setCuisine] = useState('All');
  const [sort, setSort] = useState<SortKey>('rating');
  const lines = useBuyerCart((s) => s.lines);

  const q = useQuery({ queryKey: ['buyer', 'stores'], queryFn: () => apiGet<StoresPayload>('/api/stores'), retry: false, refetchOnWindowFocus: false });
  const stores = useMemo(() => normalizeStores(q.data), [q.data]);
  const cuisines = useMemo(() => ['All', ...[...new Set(stores.map((s) => s.cuisine))].sort()], [stores]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return stores
      .filter((s) => (cuisine === 'All' || s.cuisine === cuisine)
        && (needle === '' || s.name.toLowerCase().includes(needle) || s.cuisine.toLowerCase().includes(needle)))
      .sort(SORTERS[sort]);
  }, [stores, query, cuisine, sort]);
  const count = cartCount(lines);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--accent)' }}>Buyer · Cagayan de Oro</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">What are you craving?</h1>
        </div>
        <Link to="checkout" className="rounded-full px-4 py-2 text-sm font-bold text-white" style={ACCENT}>Cart{count > 0 ? ` (${count})` : ''}</Link>
      </div>

      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search stores or cuisines…"
          className="w-full flex-1 rounded-full border border-stone-200 bg-stone-50 px-4 py-2 text-sm outline-none focus:border-emerald-500" />
        <label className="flex items-center gap-2 text-sm font-semibold text-stone-600">Sort
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="rounded-full border border-stone-200 bg-white px-3 py-2 text-sm font-semibold">
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => <option key={k} value={k}>{SORT_LABELS[k]}</option>)}
          </select>
        </label>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {cuisines.map((c) => <Chip key={c} active={cuisine === c} onClick={() => setCuisine(c)}>{c}</Chip>)}
      </div>

      {q.isPending && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="card animate-pulse overflow-hidden"><div className="h-36 bg-stone-200" />
              <div className="space-y-2 p-4"><div className="h-4 w-2/3 rounded bg-stone-200" /><div className="h-3 w-1/2 rounded bg-stone-200" /></div>
            </div>
          ))}
        </div>
      )}
      {q.isError && (
        <div className="card p-6 text-center">
          <h2 className="text-base font-extrabold">Couldn&apos;t reach the API</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-stone-500">Expected <code>GET /api/stores</code> at localhost:3001 (Vite proxies /api). Start the API and retry.</p>
          <button type="button" onClick={() => q.refetch()} className="mt-4 rounded-full px-4 py-2 text-sm font-bold text-white" style={ACCENT}>Retry</button>
        </div>
      )}
      {q.isSuccess && visible.length === 0 && (
        <div className="card p-6 text-center text-sm text-stone-500">No stores match{query.trim() ? ` "${query.trim()}"` : ''}{cuisine !== 'All' ? ` in ${cuisine}` : ''}.</div>
      )}
      {q.isSuccess && visible.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{visible.map((s) => <StoreCard key={s.id} s={s} />)}</div>
      )}
    </div>
  );
}
