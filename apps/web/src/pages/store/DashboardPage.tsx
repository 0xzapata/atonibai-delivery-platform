// Store dashboard: stat cards + live new-orders panel (poll 5s, inline accept/reject).
import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchActiveOrders, fetchStats, orderBuyer, orderCreatedAt,
  orderItemsCount, orderTotal, patchOrderAction, statsNumbers,
} from './storeApi';
import {
  EmptyState, ErrorState, PageHeader, StatusBadge, StoreShell,
  formatDateTime, formatPeso, useSelectedStore, useToast,
} from './ui';

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-bold tracking-widest text-stone-500 uppercase">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tracking-tight">{value}</p>
      {sub ? <p className="mt-1 text-xs font-semibold text-stone-500">{sub}</p> : null}
    </div>
  );
}

const ROW_ACTIONS = [
  { action: 'accept' as const, label: 'Accept', cls: 'text-white', style: { backgroundColor: 'var(--accent)' } as CSSProperties },
  { action: 'reject' as const, label: 'Reject', cls: 'border border-red-200 bg-red-50 text-red-700', style: undefined },
];

function NewOrdersPanel() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const ordersQuery = useQuery({
    queryKey: ['store', 'orders', 'active'], queryFn: fetchActiveOrders,
    refetchInterval: 5_000, retry: false, refetchOnWindowFocus: false,
  });
  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string | number; action: 'accept' | 'reject' }) =>
      patchOrderAction(id, action, action === 'reject' ? 'too_busy' : undefined),
    onSuccess: (_data, vars) => {
      toast.push(vars.action === 'accept' ? `Order ${vars.id} accepted` : `Order ${vars.id} rejected`);
      void queryClient.invalidateQueries({ queryKey: ['store', 'orders'] });
      void queryClient.invalidateQueries({ queryKey: ['store', 'stats'] });
    },
    onError: (e) => { toast.push(e instanceof Error ? e.message : 'Action failed', 'err'); },
  });
  const orders = (ordersQuery.data ?? []).filter((o) => o.status === 'placed' || o.status === 'store_accepted');

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-extrabold">New orders</h2>
        <span className="flex items-center gap-1.5 text-xs font-bold text-stone-500">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />Live · 5s
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {ordersQuery.isPending ? (
          <p className="text-sm font-semibold text-stone-500">Loading live orders…</p>
        ) : ordersQuery.isError ? (
          <ErrorState message="Orders unavailable — is the API running at localhost:3001?" onRetry={() => void ordersQuery.refetch()} />
        ) : orders.length === 0 ? (
          <EmptyState message="No new orders right now. New placed orders appear here live." />
        ) : (
          orders.map((o) => (
            <div key={String(o.id)} className="flex flex-col gap-2 rounded-2xl border border-stone-200 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link to={`/store/orders/${o.id}`} className="font-extrabold hover:underline">#{String(o.id)}</Link>
                  <StatusBadge status={o.status} />
                </div>
                <p className="mt-1 truncate text-sm text-stone-600">{orderBuyer(o)} · {orderItemsCount(o)} item(s) · {formatDateTime(orderCreatedAt(o))}</p>
                <p className="text-sm font-extrabold">{formatPeso(orderTotal(o))}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {ROW_ACTIONS.map((a) => (
                  <button key={a.action} type="button" disabled={actionMutation.isPending}
                    onClick={() => actionMutation.mutate({ id: o.id, action: a.action })}
                    style={a.style} className={`rounded-full px-4 py-1.5 text-xs font-bold disabled:opacity-50 ${a.cls}`}>{a.label}</button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
      <Link to="/store/orders" className="mt-3 inline-block text-sm font-bold text-stone-700 hover:underline">Open order kanban →</Link>
    </section>
  );
}

export default function DashboardPage() {
  const { selectedName } = useSelectedStore();
  const statsQuery = useQuery({
    queryKey: ['store', 'stats'], queryFn: fetchStats,
    refetchInterval: 15_000, retry: false, refetchOnWindowFocus: false,
  });
  const stats = statsNumbers(statsQuery.data);
  const cards = [
    { label: 'Today revenue', value: statsQuery.isPending ? '…' : formatPeso(stats.todayRevenue), sub: 'Gross sales today (₱)' },
    { label: 'Active orders', value: statsQuery.isPending ? '…' : String(stats.activeCount), sub: 'Placed → delivering' },
    { label: 'Delivered today', value: statsQuery.isPending ? '…' : String(stats.deliveredToday), sub: 'Completed dropoffs' },
  ];
  return (
    <StoreShell>
      <PageHeader title={selectedName ? `${selectedName} — Dashboard` : 'Store dashboard'}
        blurb="Sales today, live incoming orders, quick accept / reject."
        right={<Link to="/store/menu" className="rounded-full border border-stone-200 bg-white px-4 py-1.5 text-sm font-bold text-stone-700">Edit menu</Link>} />
      {statsQuery.isError ? (
        <ErrorState message="Stats unavailable — is the API running at localhost:3001?" onRetry={() => void statsQuery.refetch()} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {cards.map((c) => <StatCard key={c.label} label={c.label} value={c.value} sub={c.sub} />)}
        </div>
      )}
      <NewOrdersPanel />
    </StoreShell>
  );
}
