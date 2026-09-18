// Rider active delivery: summary + store->buyer map + PIN pickup +
// simulated run (tracking pings) + delivered + earnings.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';
import {
  RIDER_EMAIL,
  deliverOrder,
  fetchActiveOrder,
  fetchStoreCoords,
  matchStoreCoords,
  peso,
  pickupOrder,
  postTracking,
  shortId,
  type ActiveOrder,
} from './riderApi';
import { bearingDeg, fetchRoute } from './geo';
import { SEED_NOTE, loadDelivered, recordDelivered, todayStats, type DeliveredEntry } from './earnings';
import { toast } from './toast';

const ACTIVE_KEY = ['rider', 'active', RIDER_EMAIL];

const ESRI_TILES =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
const ESRI_ATTR =
  'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics | &copy; OpenStreetMap contributors';
const CAR_URL = `${import.meta.env.BASE_URL}car.svg`;

const PIN_STYLES: Record<string, string> = { Store: '#ea580c', Buyer: '#2563eb' };

function pinIcon(label: string): L.DivIcon {
  const bg = PIN_STYLES[label] ?? '#57534e';
  return L.divIcon({
    className: '',
    html: `<div style="display:flex;align-items:center;gap:4px;background:${bg};color:#fff;font:800 11px system-ui;padding:4px 8px;border-radius:9999px;border:2px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.35);white-space:nowrap">${label}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, -8],
  });
}

function storePin(): L.DivIcon {
  return pinIcon('Store');
}

function buyerPin(): L.DivIcon {
  return pinIcon('Buyer');
}

function carIcon(heading: number): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<img src="${CAR_URL}" width="48" height="48" alt="rider" style="transform:rotate(${heading}deg);filter:drop-shadow(0 2px 4px rgba(0,0,0,.4))" />`,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
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

function EarningsCard({ entries }: { entries: DeliveredEntry[] }) {
  const stats = todayStats(entries);
  return (
    <section className="card space-y-2 p-4">
      <h2 className="text-sm font-extrabold">Today&apos;s earnings</h2>
      <div className="flex gap-2">
        <div className="flex-1 rounded-2xl bg-stone-100 p-3 text-center">
          <p className="text-2xl font-extrabold">{stats.count}</p>
          <p className="text-[11px] font-bold tracking-wide text-stone-500 uppercase">delivered</p>
        </div>
        <div className="flex-1 rounded-2xl bg-emerald-50 p-3 text-center">
          <p className="text-2xl font-extrabold text-emerald-700">{peso(stats.sum)}</p>
          <p className="text-[11px] font-bold tracking-wide text-emerald-700 uppercase">order value</p>
        </div>
      </div>
      <p className="text-[11px] font-semibold text-stone-400">{SEED_NOTE}</p>
    </section>
  );
}

function statusLabel(status: string): string {
  return status.trim().toLowerCase().replace(/_/g, ' ');
}

// Status → which action sections show. Replaces scattered if-if-if status checks.
const STATUS_ACTIONS: Record<string, { pickup: boolean; sim: boolean; deliver: boolean }> = {
  rider_assigned: { pickup: true, sim: false, deliver: false },
  picked_up: { pickup: false, sim: true, deliver: true },
  delivering: { pickup: true, sim: true, deliver: true },
};

function actionsFor(status: string): { pickup: boolean; sim: boolean; deliver: boolean } {
  return STATUS_ACTIONS[status] ?? { pickup: false, sim: false, deliver: false };
}

function LoadingCard({ text }: { text: string }) {
  return <div className="card animate-pulse p-6 text-sm text-stone-500">{text}</div>;
}

function ActiveLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="card p-6 text-center">
      <h2 className="text-base font-extrabold">Couldn&apos;t load the active order</h2>
      <p className="mt-1 text-sm text-stone-500">
        Expected <code>GET /api/rider/active?riderEmail=</code>. It polls every 5s once reachable.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-full px-4 py-2 text-sm font-bold text-white"
        style={{ backgroundColor: 'var(--accent)' }}
      >
        Retry
      </button>
    </div>
  );
}

function NoActiveCard() {
  return (
    <div className="card p-6 text-center">
      <h2 className="text-base font-extrabold">No active delivery</h2>
      <p className="mt-1 text-sm text-stone-500">
        Accept an offer from the queue and it will show up here with the pickup map.
      </p>
      <Link
        to=".."
        className="mt-4 inline-block rounded-full px-4 py-2 text-sm font-bold text-white"
        style={{ backgroundColor: 'var(--accent)' }}
      >
        ← Back to offers
      </Link>
    </div>
  );
}

function OrderCard({
  order,
  effectiveStatus,
  simRunning,
}: {
  order: ActiveOrder;
  effectiveStatus: string;
  simRunning: boolean;
}) {
  return (
    <>
      <div className="card flex flex-wrap items-center gap-2 p-4">
        <span
          className="rounded-full px-3 py-1.5 text-xs font-extrabold text-white uppercase"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          {statusLabel(effectiveStatus)}
        </span>
        {simRunning && (
          <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-700">
            ● Sim run · pings 1/sec
          </span>
        )}
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
        <span className="ml-auto text-[11px] font-semibold text-stone-400">live · 5s poll</span>
      </div>
      <div className="card space-y-1 p-4">
        <p className="text-xs font-bold tracking-widest text-stone-400 uppercase">
          Order #{shortId(order.id)}
        </p>
        <p className="text-base font-extrabold">{order.store?.name ?? 'Store'}</p>
        {order.payment_method && (
          <p className="text-xs font-semibold text-stone-500 uppercase">
            Pay via {order.payment_method}
          </p>
        )}
        {order.items.length > 0 && (
          <ul className="mt-2 space-y-1 border-t border-stone-100 pt-2 text-sm text-stone-600">
            {order.items.map((it, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span>
                  {it.qty}× {it.name}
                </span>
                {it.price !== null && <span className="font-bold">{peso(it.price)}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

interface MapProps {
  center: [number, number];
  line: Array<[number, number]>;
  storeCoord: { lat: number; lng: number } | null;
  buyerCoord: { lat: number; lng: number } | null;
  riderMarker: { pos: [number, number]; heading: number } | null;
  storeIcon: L.DivIcon;
  buyerIcon: L.DivIcon;
  riderIcon: L.DivIcon;
}

function DeliveryMap({
  center,
  line,
  storeCoord,
  buyerCoord,
  riderMarker,
  storeIcon,
  buyerIcon,
  riderIcon,
}: MapProps) {
  return (
    <div className="card overflow-hidden">
      <div className="h-64 sm:h-80">
        <MapContainer
          center={center}
          zoom={14}
          scrollWheelZoom={false}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer url={ESRI_TILES} attribution={ESRI_ATTR} />
          <FitBounds points={line} />
          {storeCoord && <Marker position={[storeCoord.lat, storeCoord.lng]} icon={storeIcon} />}
          {buyerCoord && <Marker position={[buyerCoord.lat, buyerCoord.lng]} icon={buyerIcon} />}
          {line.length > 1 && (
            <Polyline positions={line} pathOptions={{ color: '#00b14f', weight: 4 }} />
          )}
          {riderMarker && <Marker position={riderMarker.pos} icon={riderIcon} />}
        </MapContainer>
      </div>
      <p className="border-t border-stone-100 px-4 py-2 text-[11px] text-stone-400">
        Esri WorldStreetMap · route via OSRM (straight-line fallback) · car.svg rider marker
      </p>
    </div>
  );
}

function PickupCard({
  pin,
  setPin,
  pinBusy,
  onSubmit,
}: {
  pin: string;
  setPin: (v: string) => void;
  pinBusy: boolean;
  onSubmit: () => void;
}) {
  return (
    <div className="card space-y-3 p-4">
      <h2 className="text-sm font-extrabold">Confirm pickup</h2>
      <p className="text-xs text-stone-500">
        Ask the buyer for the handover PIN, enter it, then mark the order picked up.
      </p>
      <div className="flex gap-2">
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 8))}
          inputMode="numeric"
          placeholder="Pickup PIN"
          className="min-w-0 flex-1 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-center text-lg font-extrabold tracking-[0.3em] outline-none focus:border-emerald-500"
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={pinBusy}
          className="rounded-full px-5 py-2.5 text-sm font-extrabold text-white disabled:opacity-60"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          {pinBusy ? 'Checking…' : 'Picked up'}
        </button>
      </div>
    </div>
  );
}

function SimCard({
  simRunning,
  onStart,
  onStop,
}: {
  simRunning: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  return (
    <div className="card space-y-2 p-4">
      <h2 className="text-sm font-extrabold">Run to buyer</h2>
      <p className="text-xs text-stone-500">
        Animates the car along the route at ~8x and posts <code>/api/tracking</code> pings ~1/sec.
      </p>
      {simRunning ? (
        <button
          type="button"
          onClick={onStop}
          className="w-full rounded-full bg-stone-900 px-4 py-2.5 text-sm font-extrabold text-white"
        >
          Stop simulation
        </button>
      ) : (
        <button
          type="button"
          onClick={onStart}
          className="w-full rounded-full px-4 py-2.5 text-sm font-extrabold text-white"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          Simulate run
        </button>
      )}
    </div>
  );
}

export default function ActivePage() {
  const queryClient = useQueryClient();
  const [pin, setPin] = useState('');
  const [pinBusy, setPinBusy] = useState(false);
  const [deliverBusy, setDeliverBusy] = useState(false);
  const [entries, setEntries] = useState<DeliveredEntry[]>(() => loadDelivered());

  // --- simulated run state ---
  const [simRunning, setSimRunning] = useState(false);
  const [simDelivering, setSimDelivering] = useState(false);
  const [simPos, setSimPos] = useState<[number, number] | null>(null);
  const [simHeading, setSimHeading] = useState(0);
  const simTimer = useRef<number | null>(null);

  const activeQuery = useQuery({
    queryKey: ACTIVE_KEY,
    queryFn: fetchActiveOrder,
    refetchInterval: 5000,
    retry: false,
  });

  const storesQuery = useQuery({
    queryKey: ['rider', 'stores'],
    queryFn: fetchStoreCoords,
    staleTime: 60_000,
    retry: false,
  });

  const order: ActiveOrder | null = activeQuery.data ?? null;
  const status = (order?.status ?? '').trim().toLowerCase();

  // Reset transient UI when the active order changes / clears.
  useEffect(() => {
    setPin('');
    setSimDelivering(false);
    setSimPos(null);
    setSimRunning(false);
    if (simTimer.current !== null) {
      window.clearInterval(simTimer.current);
      simTimer.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id ?? null]);

  // Stop the simulator on unmount.
  useEffect(
    () => () => {
      if (simTimer.current !== null) window.clearInterval(simTimer.current);
    },
    [],
  );

  // Store coords: prefer the embedded payload, fall back to GET /api/stores by name.
  const storeCoord = useMemo(() => {
    if (order?.store?.lat != null && order?.store?.lng != null) {
      return { lat: order.store.lat, lng: order.store.lng };
    }
    return matchStoreCoords(storesQuery.data ?? [], order?.store?.name ?? null);
  }, [order?.store?.lat, order?.store?.lng, order?.store?.name, storesQuery.data]);

  const buyerCoord = useMemo(() => {
    if (order?.buyer_lat != null && order?.buyer_lng != null) {
      return { lat: order.buyer_lat, lng: order.buyer_lng };
    }
    return null;
  }, [order?.buyer_lat, order?.buyer_lng]);

  const [route, setRoute] = useState<Array<[number, number]> | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!storeCoord || !buyerCoord) {
        setRoute(null);
        return;
      }
      try {
        const r = await fetchRoute(storeCoord.lng, storeCoord.lat, buyerCoord.lng, buyerCoord.lat);
        if (!cancelled) setRoute(r);
      } catch {
        if (!cancelled) setRoute(null);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [storeCoord, buyerCoord]);

  const line: Array<[number, number]> = useMemo(() => {
    if (route && route.length > 1) return route;
    if (storeCoord && buyerCoord) {
      return [
        [storeCoord.lat, storeCoord.lng],
        [buyerCoord.lat, buyerCoord.lng],
      ];
    }
    return [];
  }, [route, storeCoord, buyerCoord]);

  const center: [number, number] = useMemo(() => {
    if (line.length > 0) {
      const lats = line.map((p) => p[0]);
      const lngs = line.map((p) => p[1]);
      return [
        (Math.min(...lats) + Math.max(...lats)) / 2,
        (Math.min(...lngs) + Math.max(...lngs)) / 2,
      ];
    }
    if (storeCoord) return [storeCoord.lat, storeCoord.lng];
    return [8.4861, 124.648];
  }, [line, storeCoord]);

  const riderMarker: { pos: [number, number]; heading: number } | null = useMemo(() => {
    if (simPos) return { pos: simPos, heading: simHeading };
    if (line.length > 1) {
      // Parked at the store until the simulated run moves the marker.
      const first = line[0];
      const second = line[1];
      if (!first || !second) return null;
      return { pos: first, heading: bearingDeg(first[0], first[1], second[0], second[1]) };
    }
    return null;
  }, [simPos, simHeading, line]);

  const storeIcon = useMemo(() => storePin(), []);
  const buyerIcon = useMemo(() => buyerPin(), []);
  const riderIcon = useMemo(
    () => carIcon(riderMarker?.heading ?? 0),
    [riderMarker?.heading],
  );

  async function refetchActive() {
    await queryClient.invalidateQueries({ queryKey: ACTIVE_KEY });
  }

  async function submitPickup() {
    if (!order || pinBusy) return;
    if (pin.trim().length < 4) {
      toast('Enter the 4+ digit PIN from the buyer', 'err');
      return;
    }
    setPinBusy(true);
    try {
      await pickupOrder(order.id, pin.trim());
      toast('Picked up — head to the buyer', 'ok');
      setPin('');
      await refetchActive();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Pickup failed', 'err');
    } finally {
      setPinBusy(false);
    }
  }

  function stopSim(msg?: string) {
    if (simTimer.current !== null) {
      window.clearInterval(simTimer.current);
      simTimer.current = null;
    }
    setSimRunning(false);
    if (msg) toast(msg, 'ok');
  }

  function startSim() {
    if (!order || simRunning || line.length < 2) return;
    // ~8x: compress a typical ~8 min store->buyer run into ~60 s of 1 ping/sec.
    const step = Math.max(1, line.length / 60);
    let progress = 0;
    let firstPing = true;
    setSimRunning(true);
    toast('Simulating run — posting tracking pings ~1/sec', 'info');
    simTimer.current = window.setInterval(() => {
      progress = Math.min(line.length - 1, progress + step);
      const lo = Math.floor(progress);
      const hi = Math.min(line.length - 1, lo + 1);
      const frac = progress - lo;
      const a = line[lo];
      const b = line[hi];
      if (!a || !b) {
        stopSim();
        return;
      }
      const lat = a[0] + (b[0] - a[0]) * frac;
      const lng = a[1] + (b[1] - a[1]) * frac;
      const heading = bearingDeg(a[0], a[1], b[0], b[1]);
      setSimPos([lat, lng]);
      setSimHeading(heading);
      if (order) {
        postTracking({ orderId: order.id, lat, lng, heading }).catch(() => {
          // Tracking pings are best-effort; the marker keeps moving.
        });
      }
      if (firstPing) {
        firstPing = false;
        // No picked_up -> delivering API transition exists, so the run marks
        // delivering locally once the rider is moving.
        setSimDelivering(true);
        void refetchActive();
      }
      if (progress >= line.length - 1) {
        stopSim('Arrived at buyer — tap Delivered');
      }
    }, 1000);
  }

  async function submitDeliver() {
    if (!order || deliverBusy) return;
    setDeliverBusy(true);
    try {
      await deliverOrder(order.id);
      setEntries(recordDelivered(order.id, order.total ?? 0));
      toast(`Delivered · ${order.total !== null ? peso(order.total) : 'order'} counted`, 'ok');
      stopSim();
      await refetchActive();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Deliver failed', 'err');
    } finally {
      setDeliverBusy(false);
    }
  }

  const effectiveStatus = simDelivering && status === 'picked_up' ? 'delivering' : status;
  const actions = actionsFor(status);
  const canPickup = actions.pickup;
  const canSim = actions.sim && line.length > 1;
  const canDeliver = actions.deliver;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link
          to=".."
          className="rounded-full bg-white px-3 py-1.5 text-sm font-bold ring-1 ring-stone-200"
        >
          ← Offers
        </Link>
        <h1 className="text-xl font-extrabold">Active delivery</h1>
      </div>

      {activeQuery.isPending && <LoadingCard text="Loading active order…" />}

      {activeQuery.isError && <ActiveLoadError onRetry={() => activeQuery.refetch()} />}

      {order && (
        <>
          <OrderCard order={order} effectiveStatus={effectiveStatus} simRunning={simRunning} />
          <DeliveryMap
            center={center}
            line={line}
            storeCoord={storeCoord}
            buyerCoord={buyerCoord}
            riderMarker={riderMarker}
            storeIcon={storeIcon}
            buyerIcon={buyerIcon}
            riderIcon={riderIcon}
          />
          {canPickup && (
            <PickupCard pin={pin} setPin={setPin} pinBusy={pinBusy} onSubmit={submitPickup} />
          )}
          {canSim && (
            <SimCard
              simRunning={simRunning}
              onStart={startSim}
              onStop={() => stopSim('Simulation stopped')}
            />
          )}
          {canDeliver && (
            <button
              type="button"
              onClick={submitDeliver}
              disabled={deliverBusy}
              className="w-full rounded-full bg-stone-900 px-4 py-3 text-sm font-extrabold text-white disabled:opacity-60"
            >
              {deliverBusy ? 'Completing…' : 'Mark delivered'}
            </button>
          )}
        </>
      )}

      {!activeQuery.isPending && !order && !activeQuery.isError && <NoActiveCard />}

      <EarningsCard entries={entries} />
    </div>
  );
}
