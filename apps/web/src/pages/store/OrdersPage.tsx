// Orders kanban: columns by status group. Cards link to detail.
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { OrderSummary } from './types';
import {
  fetchActiveOrders,
  fetchAllOrders,
  orderBuyer,
  orderCreatedAt,
  orderItemsCount,
  orderTotal,
} from './storeApi';
import {
  EmptyState,
  ErrorState,
  GROUP_LABELS,
  PageHeader,
  StatusBadge,
  StoreShell,
  formatDateTime,
  formatPeso,
  groupForStatus,
} from './ui';

const COLUMNS = [
  { key: 'new', title: GROUP_LABELS.new, hint: 'placed + store_accepted' },
  { key: 'preparing', title: GROUP_LABELS.preparing, hint: 'preparing' },
  { key: 'ready', title: GROUP_LABELS.ready, hint: 'ready for rider' },
  { key: 'on_the_way', title: GROUP_LABELS.on_the_way, hint: 'rider_assigned → delivering' },
] as const;

function OrderCard({ order }: { order: OrderSummary }) {
  return (
    <Link
      to={`/store/orders/${order.id}`}
      className="card block p-3 transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-extrabold">#{String(order.id)}</span>
        <StatusBadge status={order.status} />
      </div>
      <p className="mt-1 truncate text-sm text-stone-600">{orderBuyer(order)}</p>
      <p className="mt-1 flex items-center justify-between text-sm">
        <span className="font-extrabold">{formatPeso(orderTotal(order))}</span>
        <span className="font-semibold text-stone-500">{orderItemsCount(order)} items</span>
      </p>
      <p className="mt-1 text-xs font-semibold text-stone-400">
        {formatDateTime(orderCreatedAt(order))}
      </p>
    </Link>
  );
}

export default function OrdersPage() {
  const [scope, setScope] = useState<'active' | 'all'>('active');
  const ordersQuery = useQuery({
    queryKey: ['store', 'orders', scope],
    queryFn: () => (scope === 'all' ? fetchAllOrders() : fetchActiveOrders()),
    refetchInterval: 5_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const grouped = useMemo(() => {
    const base: Record<string, OrderSummary[]> = {
      new: [],
      preparing: [],
      ready: [],
      on_the_way: [],
      done: [],
    };
    for (const o of ordersQuery.data ?? []) {
      base[groupForStatus(o.status)]?.push(o);
    }
    return base;
  }, [ordersQuery.data]);

  const doneCount = grouped.done.length;

  return (
    <StoreShell>
      <PageHeader
        title="Orders"
        blurb="Kanban by kitchen stage. Cards open full detail with next-step actions."
        right={
          <div className="flex rounded-full border border-stone-200 bg-white p-1 text-xs font-bold">
            <button
              type="button"
              onClick={() => setScope('active')}
              className={`rounded-full px-3 py-1.5 ${scope === 'active' ? 'bg-stone-900 text-white' : 'text-stone-600'}`}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => setScope('all')}
              className={`rounded-full px-3 py-1.5 ${scope === 'all' ? 'bg-stone-900 text-white' : 'text-stone-600'}`}
            >
              History
            </button>
          </div>
        }
      />
      {ordersQuery.isPending ? (
        <p className="text-sm font-semibold text-stone-500">Loading orders…</p>
      ) : ordersQuery.isError ? (
        <ErrorState
          message="Orders unavailable — is the API running at localhost:3001?"
          onRetry={() => void ordersQuery.refetch()}
        />
      ) : (ordersQuery.data ?? []).length === 0 ? (
        <EmptyState message="No orders in this view yet." />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {COLUMNS.map((col) => (
              <section key={col.key} className="card flex flex-col p-3">
                <header className="flex items-baseline justify-between px-1 pb-2">
                  <h2 className="text-sm font-extrabold">
                    {col.title}{' '}
                    <span className="ml-1 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-bold text-stone-500">
                      {grouped[col.key].length}
                    </span>
                  </h2>
                </header>
                <p className="px-1 pb-2 text-xs font-semibold text-stone-400">{col.hint}</p>
                <div className="space-y-2">
                  {grouped[col.key].length === 0 ? (
                    <p className="rounded-xl bg-stone-50 px-3 py-4 text-center text-xs font-semibold text-stone-400">
                      Empty
                    </p>
                  ) : (
                    grouped[col.key].map((o) => (
                      <OrderCard key={String(o.id)} order={o} />
                    ))
                  )}
                </div>
              </section>
            ))}
          </div>
          {scope === 'all' && doneCount > 0 ? (
            <section className="card p-4">
              <h2 className="text-sm font-extrabold">
                Done{' '}
                <span className="ml-1 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-bold text-stone-500">
                  {doneCount}
                </span>
              </h2>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {grouped.done.map((o) => (
                  <OrderCard key={String(o.id)} order={o} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </StoreShell>
  );
}
