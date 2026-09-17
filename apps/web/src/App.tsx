import { Link, Route, Routes, useRoutes } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  apiGet,
  countStores,
  type HealthResponse,
  type StoresPayload,
} from './lib/api';
import { PERSONAS, usePersona } from './lib/persona';
import { buyerRoutes } from './pages/buyer/routes';
import { storeRoutes } from './pages/store/routes';
import { riderRoutes } from './pages/rider/routes';
import { opsRoutes } from './pages/ops/routes';
import { supportRoutes } from './pages/support/routes';

function BuyerSection() {
  return useRoutes(buyerRoutes);
}

function StoreSection() {
  return useRoutes(storeRoutes);
}

function RiderSection() {
  return useRoutes(riderRoutes);
}

function OpsSection() {
  return useRoutes(opsRoutes);
}

function SupportSection() {
  return useRoutes(supportRoutes);
}

function ShellHeader() {
  return (
    <header className="glass sticky top-0 z-10 border-b border-stone-200">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
        <Link to="/" className="text-lg font-extrabold tracking-tight">
          Kaon<span style={{ color: 'var(--accent)' }}>CDO</span>
        </Link>
        <nav className="flex max-w-[62vw] items-center gap-1 overflow-x-auto text-sm font-semibold sm:max-w-none sm:gap-2">
          <Link className="rounded-full px-3 py-1.5 hover:bg-stone-200/60" to="/buyer">
            Buyer
          </Link>
          <Link className="rounded-full px-3 py-1.5 hover:bg-stone-200/60" to="/store">
            Store
          </Link>
          <Link className="rounded-full px-3 py-1.5 hover:bg-stone-200/60" to="/rider">
            Rider
          </Link>
          <Link className="rounded-full px-3 py-1.5 hover:bg-stone-200/60" to="/ops">
            Ops
          </Link>
          <Link className="rounded-full px-3 py-1.5 hover:bg-stone-200/60" to="/support">
            Support
          </Link>
        </nav>
      </div>
    </header>
  );
}

function StatusDot({ state }: { state: 'ok' | 'error' | 'loading' }) {
  const color =
    state === 'ok'
      ? 'bg-emerald-500'
      : state === 'error'
        ? 'bg-red-500'
        : 'bg-amber-400 animate-pulse';
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />;
}

function ApiStatusPanel() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => apiGet<HealthResponse>('/health'),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const stores = useQuery({
    queryKey: ['stores'],
    queryFn: () => apiGet<StoresPayload>('/api/stores'),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const storeCount = countStores(stores.data);
  const healthState = health.data
    ? 'ok'
    : health.error || health.isError
      ? 'error'
      : 'loading';
  const storesState =
    storeCount !== null ? 'ok' : stores.error || stores.isError ? 'error' : 'loading';

  return (
    <section className="card p-5">
      <h2 className="text-base font-bold">Live API status</h2>
      <p className="mt-1 text-sm text-stone-500">
        Served by the Fastify API (dev proxy on <code>/api</code>).
      </p>
      <dl className="mt-4 space-y-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="font-semibold">GET /health</dt>
          <dd className="flex items-center gap-2 text-stone-600">
            <StatusDot state={healthState} />
            {health.data
              ? `${health.data.service} · ok`
              : health.isPending
                ? 'checking…'
                : 'unreachable'}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="font-semibold">GET /api/stores</dt>
          <dd className="flex items-center gap-2 text-stone-600">
            <StatusDot state={storesState} />
            {storeCount !== null
              ? `${storeCount} store${storeCount === 1 ? '' : 's'}`
              : stores.isPending
                ? 'loading…'
                : 'unavailable'}
          </dd>
        </div>
      </dl>
      {(health.error instanceof Error || stores.error instanceof Error) && (
        <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
          API not reachable. Start it with <code>npm run dev:api</code> (or docker
          compose) and refresh.
        </p>
      )}
    </section>
  );
}

function HomePage() {
  const [persona, setPersona] = usePersona();

  return (
    <div className="space-y-8">
      <section className="card overflow-hidden">
        <div className="p-6 sm:p-8" style={{ background: 'linear-gradient(135deg, #e9f9f0, #ffffff)' }}>
          <p className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--accent)' }}>
            KaonCDO · Food-delivery POC
          </p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
            Pick a persona to start the demo
          </h1>
          <p className="mt-2 max-w-xl text-sm text-stone-600 sm:text-base">
            Mock auth only — choosing a role stores a stub persona used as the{' '}
            <code>x-persona</code> header. Current persona:{' '}
            <strong>{persona}</strong>.
          </p>
        </div>
      </section>

      <section>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PERSONAS.map((role) => (
            <Link
              key={role.id}
              to={role.to}
              onClick={() => setPersona(role.id)}
              className="card group p-5 transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <h2 className="text-base font-bold group-hover:underline">
                {role.label}
              </h2>
              <p className="mt-1 text-sm text-stone-500">{role.blurb}</p>
              <span
                className="mt-4 inline-block rounded-full px-3 py-1 text-xs font-bold text-white"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                Open {role.label} →
              </span>
            </Link>
          ))}
          <ApiStatusPanel />
        </div>
      </section>
    </div>
  );
}

function NotFoundPage() {
  return (
    <div className="card mx-auto max-w-xl p-8 text-center">
      <h1 className="text-2xl font-extrabold">Page not found</h1>
      <Link
        to="/"
        className="mt-4 inline-block rounded-full px-4 py-2 text-sm font-bold text-white"
        style={{ backgroundColor: 'var(--accent)' }}
      >
        ← Back home
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <div className="min-h-screen">
      <ShellHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/buyer/*" element={<BuyerSection />} />
          <Route path="/store/*" element={<StoreSection />} />
          <Route path="/rider/*" element={<RiderSection />} />
          <Route path="/ops/*" element={<OpsSection />} />
          <Route path="/support/*" element={<SupportSection />} />
          <Route path="/rider/*" element={<RiderSection />} />
          <Route path="/ops/*" element={<OpsSection />} />
          <Route path="/support/*" element={<SupportSection />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </div>
  );
}
