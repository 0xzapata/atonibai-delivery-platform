// Rider home: identity chip + presence toggle + offer queue + active banner.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  RIDER_EMAIL,
  acceptOffer,
  declineOffer,
  fetchActiveOrder,
  fetchOffers,
  peso,
  postPresence,
  shortId,
  type RiderOffer,
  type RiderStatus,
} from './riderApi';
import { toast } from './toast';

const OFFERS_KEY = ['rider', 'offers', RIDER_EMAIL];
const ACTIVE_KEY = ['rider', 'active', RIDER_EMAIL];

/** Re-renders every second so offer countdowns tick. */
function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}

function countdown(expiresAt: string | null, now: number): string {
  if (!expiresAt) return 'no expiry';
  const ms = new Date(expiresAt).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return 'expired';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s left` : `${s}s left`;
}

const STATUS_STYLES: Record<RiderStatus, string> = {
  online: 'bg-emerald-500',
  busy: 'bg-amber-500',
  offline: 'bg-stone-400',
};

const VALID_PRESENCE: Record<string, RiderStatus> = {
  online: 'online',
  busy: 'busy',
  offline: 'offline',
};

function PresenceToggle({
  status,
  pending,
  onChange,
}: {
  status: RiderStatus;
  pending: boolean;
  onChange: (s: RiderStatus) => void;
}) {
  const options: RiderStatus[] = ['online', 'busy', 'offline'];
  return (
    <div className="grid grid-cols-3 gap-2">
      {options.map((opt) => {
        const selected = status === opt;
        return (
          <button
            key={opt}
            type="button"
            disabled={pending}
            onClick={() => onChange(opt)}
            className={`rounded-full px-3 py-2 text-sm font-extrabold capitalize transition disabled:opacity-60 ${
              selected ? 'text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
            style={selected ? { backgroundColor: 'var(--accent)' } : undefined}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function OfferCard({ offer, now }: { offer: RiderOffer; now: number }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);

  async function doAccept() {
    await acceptOffer(offer.id);
    toast(`Order ${shortId(offer.order_id)} accepted — head to pickup`, 'ok');
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: OFFERS_KEY }),
      queryClient.invalidateQueries({ queryKey: ACTIVE_KEY }),
    ]);
    navigate('active');
  }

  async function doDecline() {
    await declineOffer(offer.id);
    toast('Offer declined', 'info');
    await queryClient.invalidateQueries({ queryKey: OFFERS_KEY });
  }

  // Offer verb → action. Replaces accept/decline if-else with a table.
  const OFFER_ACTION = { accept: doAccept, decline: doDecline } as const;

  async function act(kind: 'accept' | 'decline') {
    setBusy(kind);
    try {
      await OFFER_ACTION[kind]();
    } catch (e) {
      toast(e instanceof Error ? e.message : `Failed to ${kind} offer`, 'err');
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="card space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold">{offer.store_name}</h2>
          <p className="text-xs font-semibold text-stone-400">Order #{shortId(offer.order_id)}</p>
        </div>
        {offer.total !== null && (
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-extrabold text-emerald-700">
            {peso(offer.total)}
          </span>
        )}
      </div>
      <p className="text-xs font-bold text-amber-600">⏳ {countdown(offer.expires_at, now)}</p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => act('accept')}
          className="flex-1 rounded-full px-4 py-2.5 text-sm font-extrabold text-white disabled:opacity-60"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          {busy === 'accept' ? 'Accepting…' : 'Accept'}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => act('decline')}
          className="flex-1 rounded-full bg-stone-100 px-4 py-2.5 text-sm font-extrabold text-stone-600 hover:bg-stone-200 disabled:opacity-60"
        >
          {busy === 'decline' ? 'Declining…' : 'Decline'}
        </button>
      </div>
    </article>
  );
}

// Single place for offer loading/error/empty/list. Replaces scattered blocks.
function OfferList({
  isPending,
  isError,
  offers,
  now,
}: {
  isPending: boolean;
  isError: boolean;
  offers: RiderOffer[] | undefined;
  now: number;
}) {
  if (isPending) {
    return <div className="card animate-pulse p-6 text-sm text-stone-500">Loading offers…</div>;
  }
  if (isError) {
    return (
      <div className="card p-4 text-sm">
        <p className="font-extrabold">Offers unavailable</p>
        <p className="mt-1 text-xs text-stone-500">
          Expected <code>GET /api/rider/offers?riderEmail=</code>. Check the API at
          localhost:3001 and retry.
        </p>
      </div>
    );
  }
  if (offers && offers.length === 0) {
    return (
      <div className="card p-6 text-center">
        <p className="text-sm font-extrabold">No offers right now</p>
        <p className="mt-1 text-xs text-stone-500">
          Stay online — new offers appear here automatically every 5s.
        </p>
      </div>
    );
  }
  return (
    <>
      {(offers ?? []).map((offer) => (
        <OfferCard key={offer.id} offer={offer} now={now} />
      ))}
    </>
  );
}

export default function HomePage() {
  const now = useNow();
  const queryClient = useQueryClient();
  const [presence, setPresence] = useState<RiderStatus>('offline');
  const [riderName, setRiderName] = useState<string | null>(null);

  const offersQuery = useQuery({
    queryKey: OFFERS_KEY,
    queryFn: fetchOffers,
    refetchInterval: 5000,
    retry: false,
  });

  const activeQuery = useQuery({
    queryKey: ACTIVE_KEY,
    queryFn: fetchActiveOrder,
    refetchInterval: 5000,
    retry: false,
  });

  const presenceMutation = useMutation({
    mutationFn: postPresence,
    onSuccess: (rider) => {
      if (rider) {
        const next = VALID_PRESENCE[rider.status.trim().toLowerCase()];
        if (next) setPresence(next);
        setRiderName(rider.name);
      }
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Presence update failed', 'err'),
  });

  function setStatus(next: RiderStatus) {
    setPresence(next);
    presenceMutation.mutate(next, {
      onSuccess: () => {
        toast(
          next === 'offline' ? 'You are offline' : `You are ${next} · near Centrio, CDO`,
          next === 'offline' ? 'info' : 'ok',
        );
        void queryClient.invalidateQueries({ queryKey: OFFERS_KEY });
      },
      onError: () => setPresence((prev) => prev),
    });
  }

  const active = activeQuery.data ?? null;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold">Rider home</h1>
        <Link
          to="active"
          className="rounded-full bg-white px-3 py-1.5 text-sm font-bold ring-1 ring-stone-200"
        >
          Active delivery →
        </Link>
      </div>

      <section className="card space-y-3 p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full text-base font-extrabold text-white"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            {(riderName ?? RIDER_EMAIL).slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold">{riderName ?? 'Rider'}</p>
            <p className="truncate text-xs font-semibold text-stone-500">{RIDER_EMAIL}</p>
          </div>
          <span
            className={`ml-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-extrabold text-white capitalize ${STATUS_STYLES[presence]}`}
          >
            <span className="h-2 w-2 rounded-full bg-white" />
            {presenceMutation.isPending ? '…' : presence}
          </span>
        </div>
        <PresenceToggle status={presence} pending={presenceMutation.isPending} onChange={setStatus} />
        <p className="text-[11px] font-semibold text-stone-400">
          Going online pins you near Centrio Ayala, CDO (POC has no GPS feed).
        </p>
      </section>

      {active && (
        <Link
          to="active"
          className="card block border-emerald-200 bg-emerald-50 p-4 transition hover:shadow-md"
        >
          <p className="text-xs font-bold tracking-widest text-emerald-700 uppercase">
            Active delivery
          </p>
          <p className="mt-1 text-sm font-extrabold">
            Order #{shortId(active.id)} · {active.status.replace(/_/g, ' ')}
          </p>
          <p className="mt-0.5 text-xs font-semibold text-emerald-700">
            {active.store?.name ?? 'Store'}
            {active.total !== null ? ` · ${peso(active.total)}` : ''} — tap to open →
          </p>
        </Link>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-extrabold tracking-wide text-stone-500 uppercase">
            Offer queue · live 5s poll
          </h2>
          <button
            type="button"
            onClick={() => {
              void offersQuery.refetch();
              void activeQuery.refetch();
            }}
            className="rounded-full bg-white px-3 py-1.5 text-xs font-bold ring-1 ring-stone-200"
          >
            Refresh
          </button>
        </div>

        <OfferList
          isPending={offersQuery.isPending}
          isError={offersQuery.isError}
          offers={offersQuery.data}
          now={now}
        />
      </section>
    </div>
  );
}
