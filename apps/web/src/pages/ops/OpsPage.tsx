import 'leaflet/dist/leaflet.css';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import {
  assignOrder,
  broadcast,
  createPromo,
  fetchLive,
  fetchPromos,
  fetchStores,
  riderColor,
  type LiveOrder,
  type LiveRider,
  type PromoCreate,
} from './opsApi';
import { EmptyState, ErrorState, OpsShell, PageHeader, StatusPill, formatPeso, shortId, useToast } from './ui';

const ESRI_TILES =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
const ESRI_ATTR =
  'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics | &copy; OpenStreetMap contributors';

// POC city center (Centrio, Cagayan de Oro).
const CENTER: [number, number] = [8.4861, 124.648];

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function riderIcon(r: LiveRider): L.DivIcon {
  const color = riderColor(r.status);
  return L.divIcon({
    className: '',
    html:
      `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;transform:translateY(-6px)">` +
      `<div style="background:${color};color:#fff;font:800 10px system-ui;padding:2px 7px;border-radius:9999px;border:2px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.35);white-space:nowrap">${esc(r.name)}</div>` +
      `<div style="width:16px;height:16px;border-radius:9999px;background:${color};border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.35)"></div>` +
      `</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function storeIcon(label: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="background:#ea580c;color:#fff;font:800 11px system-ui;padding:4px 8px;border-radius:8px;border:2px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.35);white-space:nowrap">⌂ ${esc(label)}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, -6],
  });
}

// ---------- assign modal ----------

function AssignModal({
  order,
  riders,
  onClose,
}: {
  order: LiveOrder;
  riders: LiveRider[];
  onClose: (assigned: boolean) => void;
}) {
  const toast = useToast();
  const [riderId, setRiderId] = useState('');
  const [sending, setSending] = useState(false);

  async function submit() {
    if (!riderId) {
      toast.push('Pick a rider first', 'err');
      return;
    }
    setSending(true);
    try {
      await assignOrder(order.id, riderId);
      const name = riders.find((r) => r.id === riderId)?.name ?? shortId(riderId);
      toast.push(`Order #${shortId(order.id)} → ${name}`, 'ok');
      onClose(true);
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Assign failed', 'err');
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Assign order ${order.id}`}
      className="fixed inset-0 z-[900] flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={() => onClose(false)}
    >
      <div
        className="card w-full max-w-md space-y-4 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-base font-extrabold">
            Assign order #{shortId(order.id)}
          </h2>
          <p className="mt-0.5 text-sm text-stone-500">
            {order.store_name ?? '—'} · {order.buyer_name ?? '—'} ·{' '}
            <StatusPill status={order.status} />
          </p>
        </div>
        {riders.length === 0 ? (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
            No riders online right now — wait for the next 6s poll or close.
          </p>
        ) : (
          <label className="block text-sm font-bold">
            Rider
            <select
              value={riderId}
              onChange={(e) => setRiderId(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-emerald-500"
            >
              <option value="">Select a rider…</option>
              {riders.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {r.status}
                  {r.vehicle ? ` · ${r.vehicle}` : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onClose(false)}
            className="rounded-full px-4 py-2 text-sm font-bold text-stone-600 ring-1 ring-stone-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={sending || riders.length === 0}
            className="rounded-full px-4 py-2 text-sm font-extrabold text-white disabled:opacity-60"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            {sending ? 'Assigning…' : 'Force-assign'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- broadcast box ----------

function BroadcastBox() {
  const toast = useToast();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  async function send() {
    const text = message.trim();
    if (!text) {
      toast.push('Type a message first', 'err');
      return;
    }
    setSending(true);
    try {
      await broadcast(text);
      toast.push('Broadcast sent to city.ops', 'ok');
      setMessage('');
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Broadcast failed', 'err');
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="card space-y-2 p-4">
      <h2 className="text-sm font-extrabold">Broadcast to riders</h2>
      <p className="text-xs text-stone-500">
        Emits <code>ops.broadcast</code> on the city channel (max 500 chars).
      </p>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="e.g. Heavy rain — ride safe, surge +₱20 this hour"
        rows={2}
        maxLength={500}
        className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm outline-none focus:border-emerald-500"
      />
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-stone-400">
          {message.trim().length}/500
        </span>
        <button
          type="button"
          onClick={() => void send()}
          disabled={sending}
          className="rounded-full bg-stone-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          {sending ? 'Sending…' : 'Send broadcast'}
        </button>
      </div>
    </section>
  );
}

// ---------- promos ----------

const PROMO_KINDS = ['percent', 'flat', 'freeship'] as const;

function PromosCard() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const promosQuery = useQuery({
    queryKey: ['ops', 'promos'],
    queryFn: fetchPromos,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const [code, setCode] = useState('');
  const [kind, setKind] = useState<(typeof PROMO_KINDS)[number]>('percent');
  const [value, setValue] = useState('10');
  const [maxDiscount, setMaxDiscount] = useState('');
  const [minOrder, setMinOrder] = useState('0');
  const [active, setActive] = useState(true);
  const [sending, setSending] = useState(false);

  async function submit() {
    const v = Number.parseInt(value, 10);
    const min = Number.parseInt(minOrder || '0', 10);
    const max = maxDiscount.trim() === '' ? null : Number.parseInt(maxDiscount, 10);
    if (!code.trim() || !Number.isInteger(v) || v < 0) {
      toast.push('Code + non-negative integer value required', 'err');
      return;
    }
    const input: PromoCreate = {
      code: code.trim().toUpperCase(),
      kind,
      value: v,
      max_discount: max !== null && Number.isInteger(max) && max >= 0 ? max : null,
      min_order: Number.isInteger(min) && min >= 0 ? min : 0,
      active,
    };
    setSending(true);
    try {
      await createPromo(input);
      toast.push(`Promo ${input.code} created`, 'ok');
      setCode('');
      setValue('10');
      setMaxDiscount('');
      setMinOrder('0');
      await queryClient.invalidateQueries({ queryKey: ['ops', 'promos'] });
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Create promo failed', 'err');
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="card space-y-3 p-4">
      <h2 className="text-sm font-extrabold">Promos</h2>
      {promosQuery.isPending && (
        <p className="text-sm font-semibold text-stone-500">Loading promos…</p>
      )}
      {promosQuery.isError && (
        <ErrorState
          message="Promos unavailable — is the API running at localhost:3001?"
          onRetry={() => void promosQuery.refetch()}
        />
      )}
      {promosQuery.isSuccess && (promosQuery.data ?? []).length === 0 && (
        <EmptyState message="No promos yet — create the first one below." />
      )}
      {promosQuery.isSuccess && (promosQuery.data ?? []).length > 0 && (
        <ul className="space-y-1.5">
          {(promosQuery.data ?? []).map((p) => (
            <li
              key={String(p.id ?? p.code)}
              className="flex flex-wrap items-center gap-2 rounded-xl bg-stone-50 px-3 py-2 text-sm"
            >
              <span className="font-extrabold tracking-wide">{p.code}</span>
              <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[11px] font-bold text-stone-600">
                {p.kind} · {p.value}
              </span>
              {p.min_order ? (
                <span className="text-xs font-semibold text-stone-500">
                  min {formatPeso(p.min_order)}
                </span>
              ) : null}
              {p.max_discount ? (
                <span className="text-xs font-semibold text-stone-500">
                  cap {formatPeso(p.max_discount)}
                </span>
              ) : null}
              <span
                className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-extrabold ${
                  p.active ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-200 text-stone-500'
                }`}
              >
                {p.active ? 'active' : 'off'}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-2 gap-2 border-t border-stone-100 pt-3">
        <label className="col-span-1 text-xs font-bold">
          Code
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="RAINY10"
            className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold uppercase outline-none focus:border-emerald-500"
          />
        </label>
        <label className="col-span-1 text-xs font-bold">
          Kind
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
            className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-emerald-500"
          >
            {PROMO_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-bold">
          Value (int)
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="numeric"
            className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-emerald-500"
          />
        </label>
        <label className="text-xs font-bold">
          Min order (₱)
          <input
            value={minOrder}
            onChange={(e) => setMinOrder(e.target.value)}
            inputMode="numeric"
            className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-emerald-500"
          />
        </label>
        <label className="text-xs font-bold">
          Max discount (₱, blank = none)
          <input
            value={maxDiscount}
            onChange={(e) => setMaxDiscount(e.target.value)}
            inputMode="numeric"
            placeholder="optional"
            className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-emerald-500"
          />
        </label>
        <label className="flex items-end gap-2 pb-2 text-xs font-bold">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-4 w-4 accent-emerald-600"
          />
          Active
        </label>
      </div>
      <button
        type="button"
        onClick={() => void submit()}
        disabled={sending}
        className="w-full rounded-full px-4 py-2 text-sm font-extrabold text-white disabled:opacity-60"
        style={{ backgroundColor: 'var(--accent)' }}
      >
        {sending ? 'Creating…' : 'Create promo'}
      </button>
    </section>
  );
}

// ---------- main page ----------

function OpsPageInner() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [assignFor, setAssignFor] = useState<LiveOrder | null>(null);

  const liveQuery = useQuery({
    queryKey: ['ops', 'live'],
    queryFn: fetchLive,
    refetchInterval: 6_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const storesQuery = useQuery({
    queryKey: ['ops', 'stores'],
    queryFn: fetchStores,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });

  const riders = useMemo(() => liveQuery.data?.riders ?? [], [liveQuery.data]);
  const orders = useMemo(() => liveQuery.data?.active_orders ?? [], [liveQuery.data]);

  const geoRiders = useMemo(
    () => riders.filter((r) => r.lat !== null && r.lng !== null),
    [riders],
  );

  // Pin each active order's store (match by name → directory coords), deduped.
  const storePins = useMemo(() => {
    const dir = storesQuery.data ?? [];
    const seen = new Set<string>();
    const pins: Array<{ key: string; name: string; lat: number; lng: number }> = [];
    for (const o of orders) {
      const want = (o.store_name ?? '').trim().toLowerCase();
      if (!want || seen.has(want)) continue;
      const hit = dir.find((s) => s.name.trim().toLowerCase() === want);
      if (!hit || hit.lat == null || hit.lng == null) continue;
      seen.add(want);
      pins.push({ key: want, name: hit.name, lat: hit.lat, lng: hit.lng });
    }
    return pins;
  }, [orders, storesQuery.data]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Live city map"
        blurb={`${riders.length} rider${riders.length === 1 ? '' : 's'} · ${orders.length} active order${orders.length === 1 ? '' : 's'}`}
        right={
          <button
            type="button"
            onClick={() => {
              void liveQuery.refetch();
              void storesQuery.refetch();
              toast.push('Refreshing…', 'ok');
            }}
            className="rounded-full px-3 py-1.5 text-xs font-bold text-stone-600 ring-1 ring-stone-200"
          >
            Refresh now
          </button>
        }
      />

      {liveQuery.isError && (
        <ErrorState
          message="Ops feed unavailable — is the API running at localhost:3001? (GET /api/ops/live polls every 6s once reachable.)"
          onRetry={() => void liveQuery.refetch()}
        />
      )}

      {/* Map stacks above the panel on mobile; side-by-side on xl. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_1fr]">
        <section className="card overflow-hidden">
          <div className="h-[320px] w-full sm:h-[440px]">
            <MapContainer
              center={CENTER}
              zoom={13}
              scrollWheelZoom={false}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer url={ESRI_TILES} attribution={ESRI_ATTR} />
              {geoRiders.map((r) => (
                <Marker
                  key={r.id}
                  position={[r.lat as number, r.lng as number]}
                  icon={riderIcon(r)}
                />
              ))}
              {storePins.map((p) => (
                <Marker key={p.key} position={[p.lat, p.lng]} icon={storeIcon(p.name)} />
              ))}
            </MapContainer>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-stone-100 px-4 py-2 text-[11px] font-bold text-stone-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#00b14f' }} /> online
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#2563eb' }} /> busy
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="rounded bg-orange-600 px-1.5 py-0.5 text-[10px] text-white">⌂</span> active-order store
            </span>
            <span className="ml-auto font-semibold text-stone-400">
              {liveQuery.isFetching ? 'updating…' : 'Esri WorldStreetMap'}
            </span>
          </div>
        </section>

        <div className="space-y-4">
          <section className="card p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-extrabold">
                Active orders{' '}
                <span className="ml-1 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-bold text-stone-500">
                  {orders.length}
                </span>
              </h2>
              {liveQuery.isPending && (
                <span className="text-xs font-semibold text-stone-400">loading…</span>
              )}
            </div>
            <div className="mt-2 max-h-80 space-y-2 overflow-y-auto pr-0.5">
              {liveQuery.isPending && (
                <p className="text-sm font-semibold text-stone-500">Loading orders…</p>
              )}
              {liveQuery.isSuccess && orders.length === 0 && (
                <EmptyState message="No active orders right now." />
              )}
              {orders.map((o) => (
                <div
                  key={o.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl bg-stone-50 px-3 py-2"
                >
                  <span className="text-sm font-extrabold">#{shortId(o.id)}</span>
                  <StatusPill status={o.status} />
                  <span className="text-sm font-bold">
                    {o.total !== null ? formatPeso(o.total) : '—'}
                  </span>
                  <span className="w-full truncate text-xs font-semibold text-stone-500">
                    {o.store_name ?? '—'} → {o.buyer_name ?? '—'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setAssignFor(o)}
                    className="ml-auto rounded-full bg-stone-900 px-3 py-1 text-xs font-bold text-white"
                  >
                    Assign
                  </button>
                </div>
              ))}
            </div>
          </section>

          <BroadcastBox />
          <PromosCard />
        </div>
      </div>

      {assignFor && (
        <AssignModal
          order={assignFor}
          riders={riders}
          onClose={(assigned) => {
            setAssignFor(null);
            if (assigned) void queryClient.invalidateQueries({ queryKey: ['ops', 'live'] });
          }}
        />
      )}
    </div>
  );
}

export default function OpsPage() {
  return (
    <OpsShell>
      <OpsPageInner />
    </OpsShell>
  );
}
