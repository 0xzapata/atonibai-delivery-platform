import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';
import { api, apiGet } from '../../lib/api';
import { CENTRIO_LAT, CENTRIO_LNG, fetchRoute } from './geo';
import { toast } from './toast';
import {
  asRecord,
  normalizeTimeline,
  peso,
  toOrderInfo,
  toStoreLite,
} from './types';

const ESRI_TILES =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
const ESRI_ATTR = 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics | &copy; OpenStreetMap contributors';

/** Canonical fulfilment order — used for progress + rider interpolation. */
const STAGES = ['placed', 'confirmed', 'preparing', 'ready', 'picked_up', 'delivering', 'delivered'];

function stageIndex(status: string): number {
  const i = STAGES.indexOf(status.trim().toLowerCase());
  return i < 0 ? 0 : i;
}

function dot(color: string, size = 18): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.35)"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function labelPin(text: string, bg: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="display:flex;align-items:center;gap:4px;background:${bg};color:#fff;font:800 11px system-ui;padding:4px 8px;border-radius:9999px;border:2px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.35);white-space:nowrap">${text}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, -8],
  });
}

function FitBounds({ points }: { points: Array<[number, number]> }) {
  const map = useMap();
  const key = points.map((p) => p.join(',')).join('|');
  useEffect(() => {
    if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points.map((p) => L.latLng(p[0], p[1]))).pad(0.2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

function ReviewForm({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const [rating, setRating] = useState(5);
  const [target, setTarget] = useState('store');
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    setSending(true);
    try {
      await api(`/api/orders/${encodeURIComponent(orderId)}/review`, {
        method: 'POST',
        body: JSON.stringify({ rating, comment, target }),
      });
      setSent(true);
      toast('Thanks for the review', 'ok');
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to send review', 'err');
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="card p-4 text-sm font-bold text-emerald-700">
        Review submitted — salamat!
      </div>
    );
  }

  return (
    <div className="card space-y-3 p-4">
      <h2 className="text-sm font-extrabold">Rate your order</h2>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setRating(s)}
            className={`h-9 w-9 rounded-full text-lg font-extrabold ${
              s <= rating ? 'bg-amber-100 text-amber-500' : 'bg-stone-100 text-stone-300'
            }`}
          >
            ★
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        {['store', 'rider'].map((t) => (
          <label
            key={t}
            className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold capitalize ${
              target === t ? 'border-emerald-500 bg-emerald-50' : 'border-stone-200'
            }`}
          >
            <input type="radio" name="target" checked={target === t} onChange={() => setTarget(t)} />
            {t}
          </label>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="How was the food / delivery? (optional)"
        rows={2}
        className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm outline-none focus:border-emerald-500"
      />
      <button
        type="button"
        onClick={submit}
        disabled={sending}
        className="rounded-full px-4 py-2 text-sm font-extrabold text-white disabled:opacity-60"
        style={{ backgroundColor: 'var(--accent)' }}
      >
        {sending ? 'Sending…' : 'Submit review'}
      </button>
    </div>
  );
}

export default function TrackPage() {
  const { id = '' } = useParams();
  const orderId = decodeURIComponent(id);

  const orderQuery = useQuery({
    queryKey: ['buyer', 'order', orderId],
    queryFn: () => apiGet<unknown>(`/api/orders/${encodeURIComponent(orderId)}`),
    refetchInterval: 4000,
    retry: false,
  });

  const order = useMemo(() => toOrderInfo(orderQuery.data), [orderQuery.data]);
  const store = useMemo(() => {
    const root = asRecord(orderQuery.data);
    return toStoreLite(root.store ?? root.restaurant ?? null);
  }, [orderQuery.data]);
  const items = useMemo(() => {
    const root = asRecord(orderQuery.data);
    const raw = root.items;
    if (!Array.isArray(raw)) return [] as Array<Record<string, unknown>>;
    return raw.map((it) => asRecord(it));
  }, [orderQuery.data]);

  const storeLat = store?.lat ?? null;
  const storeLng = store?.lng ?? null;
  const hasGeo = storeLat !== null && storeLng !== null;

  const [route, setRoute] = useState<Array<[number, number]> | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!hasGeo || storeLat === null || storeLng === null) {
        setRoute(null);
        return;
      }
      try {
        const r = await fetchRoute(storeLng, storeLat, CENTRIO_LNG, CENTRIO_LAT);
        if (!cancelled) setRoute(r);
      } catch {
        if (!cancelled) setRoute(null);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [hasGeo, storeLat, storeLng]);

  const line: Array<[number, number]> = useMemo(() => {
    if (route && route.length > 1) return route;
    if (hasGeo && storeLat !== null && storeLng !== null) {
      return [
        [storeLat, storeLng],
        [CENTRIO_LAT, CENTRIO_LNG],
      ];
    }
    return [];
  }, [route, hasGeo, storeLat, storeLng]);

  const progress = useMemo(() => {
    const idx = stageIndex(order?.status ?? 'placed');
    return STAGES.length > 1 ? idx / (STAGES.length - 1) : 0;
  }, [order?.status]);

  const riderPos: [number, number] | null = useMemo(() => {
    if (line.length < 2) return null;
    const i = Math.min(line.length - 1, Math.round(progress * (line.length - 1)));
    return line[i] ?? null;
  }, [line, progress]);

  const center: [number, number] = useMemo(() => {
    if (line.length > 0) {
      const lats = line.map((p) => p[0]);
      const lngs = line.map((p) => p[1]);
      return [
        (Math.min(...lats) + Math.max(...lats)) / 2,
        (Math.min(...lngs) + Math.max(...lngs)) / 2,
      ];
    }
    return [CENTRIO_LAT, CENTRIO_LNG];
  }, [line]);

  const timeline = useMemo(
    () => normalizeTimeline(order?.timeline, order?.status ?? 'placed'),
    [order?.timeline, order?.status],
  );

  const storeIcon = useMemo(() => labelPin('Store', '#ea580c'), []);
  const buyerIcon = useMemo(() => labelPin('You', '#2563eb'), []);
  const riderIcon = useMemo(() => dot('#00b14f', 20), []);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link to=".." className="rounded-full bg-white px-3 py-1.5 text-sm font-bold ring-1 ring-stone-200">
          ← Stores
        </Link>
        <h1 className="text-xl font-extrabold">Order {order ? `#${order.id}` : 'tracking'}</h1>
      </div>

      {orderQuery.isPending && <div className="card animate-pulse p-6 text-sm text-stone-500">Loading order…</div>}

      {orderQuery.isError && (
        <div className="card p-6 text-center">
          <h2 className="text-base font-extrabold">Couldn&apos;t load this order</h2>
          <p className="mt-1 text-sm text-stone-500">
            Expected <code>GET /api/orders/:id</code>. It polls every 4s once reachable.
          </p>
          <button
            type="button"
            onClick={() => orderQuery.refetch()}
            className="mt-4 rounded-full px-4 py-2 text-sm font-bold text-white"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            Retry
          </button>
        </div>
      )}

      {order && (
        <>
          <div className="card flex flex-wrap items-center gap-2 p-4">
            <span
              className="rounded-full px-3 py-1.5 text-xs font-extrabold text-white"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              {order.status.replace(/_/g, ' ').toUpperCase()}
            </span>
            {order.eta_min !== null && (
              <span className="rounded-full bg-stone-100 px-3 py-1.5 text-xs font-bold">
                ETA ~{order.eta_min} min
              </span>
            )}
            {order.total !== null && (
              <span className="rounded-full bg-stone-100 px-3 py-1.5 text-xs font-bold">
                Total {peso(order.total)}
              </span>
            )}
            <span className="ml-auto text-[11px] font-semibold text-stone-400">live · 4s poll</span>
          </div>

          <div className="card overflow-hidden">
            <div className="h-64 sm:h-80">
              <MapContainer center={center} zoom={14} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
                <TileLayer url={ESRI_TILES} attribution={ESRI_ATTR} />
                <FitBounds points={line} />
                {hasGeo && storeLat !== null && storeLng !== null && (
                  <Marker position={[storeLat, storeLng]} icon={storeIcon} />
                )}
                <Marker position={[CENTRIO_LAT, CENTRIO_LNG]} icon={buyerIcon} />
                {line.length > 1 && (
                  <Polyline positions={line} pathOptions={{ color: '#00b14f', weight: 4 }} />
                )}
                {riderPos && <Marker position={riderPos} icon={riderIcon} />}
              </MapContainer>
            </div>
            <p className="border-t border-stone-100 px-4 py-2 text-[11px] text-stone-400">
              Route via OSRM (straight line fallback) · green dot = rider (car icon lands in T8)
            </p>
          </div>

          {order.pickup_pin && (
            <div className="card p-4 text-center">
              <p className="text-xs font-bold tracking-widest text-stone-500 uppercase">Pickup PIN</p>
              <p className="mt-1 text-3xl font-extrabold tracking-[0.3em]">{order.pickup_pin}</p>
              <p className="mt-1 text-xs text-stone-500">Show this to your rider at handover.</p>
            </div>
          )}

          <div className="card p-4">
            <h2 className="text-sm font-extrabold">Status timeline</h2>
            <ol className="mt-3 space-y-0">
              {timeline.map((t, i) => {
                const last = i === timeline.length - 1;
                return (
                  <li key={`${t.label}-${i}`} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={`mt-1 h-3 w-3 rounded-full ${last ? '' : 'bg-stone-300'}`}
                        style={last ? { backgroundColor: 'var(--accent)' } : undefined}
                      />
                      {!last && <span className="w-0.5 flex-1 bg-stone-200" />}
                    </div>
                    <div className={`pb-4 ${last ? 'font-extrabold' : 'text-stone-600'}`}>
                      <p className="text-sm capitalize">{t.label.replace(/_/g, ' ')}</p>
                      {t.at && <p className="text-[11px] font-semibold text-stone-400">{t.at}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          {items.length > 0 && (
            <div className="card p-4">
              <h2 className="text-sm font-extrabold">Items</h2>
              <ul className="mt-2 space-y-1 text-sm text-stone-600">
                {items.map((it, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span>
                      {String(it.qty ?? 1)}× {String(it.name ?? it.itemId ?? 'Item')}
                    </span>
                    {it.price !== undefined && (
                      <span className="font-bold">{peso(Number(it.price) || 0)}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {order.status.trim().toLowerCase() === 'delivered' && (
            <ReviewForm orderId={order.id} onDone={() => orderQuery.refetch()} />
          )}
        </>
      )}
    </div>
  );
}
