// Order detail: items, totals, buyer + payment, timeline, next-step actions.
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  OrderDetail,
  OrderDetailItem,
  OrderItemChoice,
  OrderTimelineEntry,
  RejectReason,
  StoreAction,
} from './types';
import {
  fetchOrderDetail,
  orderBuyer,
  orderCreatedAt,
  orderTotal,
  patchOrderAction,
  toNumber,
} from './storeApi';
import {
  EmptyState,
  ErrorState,
  PageHeader,
  StatusBadge,
  StoreShell,
  formatDateTime,
  formatPeso,
  useToast,
} from './ui';

const REJECT_REASONS: Array<{ value: RejectReason; label: string }> = [
  { value: 'out_of_stock', label: 'Out of stock' },
  { value: 'too_busy', label: 'Too busy' },
  { value: 'closed', label: 'Closed' },
];
const ACTION_LABELS: Record<StoreAction, string> = {
  accept: 'accepted',
  reject: 'rejected',
  preparing: 'moved to preparing',
  ready: 'marked ready',
};
// Non-placed next steps as a table; `placed` keeps its accept/reject + reason UI.
const NEXT_ACTIONS: Record<string, Array<{ action: StoreAction; label: string }>> = {
  store_accepted: [{ action: 'preparing', label: 'Start preparing' }],
  preparing: [{ action: 'ready', label: 'Mark ready' }],
};

// Exact contract keys (no alias chains — a missing field must surface, never silently morph).
function itemName(it: OrderDetailItem): string {
  return it.name ?? 'Item';
}
function itemQty(it: OrderDetailItem): number {
  return it.qty ?? 1;
}
function itemUnitPrice(it: OrderDetailItem): number {
  return toNumber(it.unit_price ?? 0);
}
function optionLabel(opt: string | OrderItemChoice): string {
  if (typeof opt === 'string') return opt;
  const base = String(opt.name || 'Option');
  const extra = toNumber(opt.price_delta ?? 0, 0);
  return extra > 0 ? `${base} (+${formatPeso(extra)})` : base;
}
function timelineLabel(e: OrderTimelineEntry): string {
  return e.status ?? 'Update';
}
function timelineAt(e: OrderTimelineEntry): string | null {
  return e.at ?? null;
}
function paymentTextOf(d: OrderDetail): string {
  const p = d.payment;
  const method = (p?.method ?? d.payment_method ?? '').toUpperCase();
  const state = p?.status ?? d.payment_status ?? '';
  return [method, state ? `· ${state}` : ''].join(' ').trim() || '—';
}
function moneyRowsOf(d: OrderDetail): Array<{ label: string; value: number }> {
  const rows: Array<{ label: string; value: number }> = [];
  const push = (label: string, v: unknown) => {
    if (v !== undefined && v !== null && v !== '') {
      rows.push({ label, value: toNumber(v, 0) });
    }
  };
  push('Subtotal', d.subtotal);
  push('Delivery fee', d.delivery_fee);
  push('Service fee', d.service_fee);
  const disc = toNumber(d.discount ?? 0, 0);
  if (disc > 0) rows.push({ label: 'Discount', value: -disc });
  return rows;
}

function ItemList({ items }: { items: OrderDetailItem[] }) {
  if (items.length === 0) return <EmptyState message="No line items returned for this order." />;
  return (
    <ul className="divide-y divide-stone-100">
      {items.map((it, i) => {
        const opts = Array.isArray(it.options) ? it.options : [];
        return (
          <li key={String(it.id ?? i)} className="py-2">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-bold">
                {itemQty(it)}× {itemName(it)}
              </span>
              <span className="font-extrabold">
                {formatPeso(itemUnitPrice(it) * itemQty(it))}
              </span>
            </div>
            {opts.length > 0 ? (
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs font-semibold text-stone-500">
                {opts.map((o, j) => (
                  <li key={j}>{optionLabel(o)}</li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function TimelineList({ entries }: { entries: OrderTimelineEntry[] }) {
  if (entries.length === 0) {
    return <p className="mt-2 text-sm font-semibold text-stone-400">No timeline events yet.</p>;
  }
  return (
    <ol className="mt-2 space-y-2">
      {entries.map((e, i) => (
        <li key={i} className="flex gap-2 text-sm">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-stone-300" />
          <span>
            <span className="font-bold">{timelineLabel(e)}</span>{' '}
            <span className="text-xs font-semibold text-stone-400">
              {formatDateTime(timelineAt(e))}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function ActionBar({
  status,
  mutate,
  pending,
}: {
  status: string;
  mutate: (v: { action: StoreAction; reason?: string }) => void;
  pending: boolean;
}) {
  const [rejectReason, setRejectReason] = useState<RejectReason>('too_busy');
  if (status === 'placed') {
    return (
      <div className="mt-2 space-y-2">
        <label className="block text-xs font-bold text-stone-500" htmlFor="reject-reason">
          Reject reason
        </label>
        <select
          id="reject-reason"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value as RejectReason)}
          className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-bold"
        >
          {REJECT_REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => mutate({ action: 'accept' })}
            className="flex-1 rounded-full px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            Accept order
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => mutate({ action: 'reject', reason: rejectReason })}
            className="flex-1 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      </div>
    );
  }
  const steps = NEXT_ACTIONS[status];
  if (steps) {
    return (
      <div className="mt-2 space-y-2">
        {steps.map((s) => (
          <button
            key={s.action}
            type="button"
            disabled={pending}
            onClick={() => mutate({ action: s.action })}
            className={`w-full rounded-full px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${s.action === 'preparing' ? 'bg-stone-900' : ''}`}
            style={s.action === 'preparing' ? undefined : { backgroundColor: 'var(--accent)' }}
          >
            {s.label}
          </button>
        ))}
      </div>
    );
  }
  return (
    <p className="mt-2 rounded-xl bg-stone-100 px-3 py-2 text-xs font-bold text-stone-500">
      No store actions for status “{status}” — rider / completion flow owns it from here.
    </p>
  );
}

export default function OrderDetailPage() {
  const params = useParams();
  const id = params.id ?? '';
  const toast = useToast();
  const queryClient = useQueryClient();

  const detailQuery = useQuery({
    queryKey: ['store', 'order', id],
    queryFn: () => fetchOrderDetail(id),
    enabled: id.length > 0,
    refetchInterval: 5_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const detail = detailQuery.data;

  const mutation = useMutation({
    mutationFn: (vars: { action: StoreAction; reason?: string }) =>
      patchOrderAction(id, vars.action, vars.reason),
    onSuccess: (_data, vars) => {
      toast.push(`Order ${id} ${ACTION_LABELS[vars.action]}`);
      void queryClient.invalidateQueries({ queryKey: ['store', 'order', id] });
      void queryClient.invalidateQueries({ queryKey: ['store', 'orders'] });
      void queryClient.invalidateQueries({ queryKey: ['store', 'stats'] });
    },
    onError: (e) => {
      toast.push(e instanceof Error ? e.message : 'Action failed', 'err');
    },
  });

  const items = useMemo(() => {
    if (!detail) return [];
    return Array.isArray(detail.items) ? detail.items : [];
  }, [detail]);

  const timeline = useMemo(() => {
    if (!detail) return [];
    return Array.isArray(detail.timeline) ? detail.timeline : [];
  }, [detail]);

  const paymentText = useMemo(() => {
    if (!detail) return '—';
    return paymentTextOf(detail);
  }, [detail]);

  const moneyRows = useMemo(() => {
    if (!detail) return [];
    return moneyRowsOf(detail);
  }, [detail]);

  return (
    <StoreShell>
      <PageHeader
        title={id ? `Order #${id}` : 'Order'}
        blurb="Full detail with valid next-step actions."
        right={
          <Link
            to="/store/orders"
            className="rounded-full border border-stone-200 bg-white px-4 py-1.5 text-sm font-bold text-stone-700"
          >
            ← Back to orders
          </Link>
        }
      />

      {detailQuery.isPending ? (
        <p className="text-sm font-semibold text-stone-500">Loading order…</p>
      ) : detailQuery.isError || !detail ? (
        <ErrorState
          message="Order unavailable — is the API running at localhost:3001?"
          onRetry={() => void detailQuery.refetch()}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <section className="card space-y-3 p-4 lg:col-span-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={detail.status} />
              <span className="text-xs font-semibold text-stone-500">
                {formatDateTime(orderCreatedAt(detail))} · {orderBuyer(detail)}
              </span>
            </div>

            <h2 className="text-sm font-extrabold">Items</h2>
            <ItemList items={items} />

            <div className="rounded-2xl bg-stone-50 p-3 text-sm">
              {moneyRows.map((r) => (
                <div key={r.label} className="flex justify-between py-0.5 text-stone-600">
                  <span className="font-semibold">{r.label}</span>
                  <span className="font-bold">{formatPeso(r.value)}</span>
                </div>
              ))}
              <div className="mt-1 flex justify-between border-t border-stone-200 pt-2">
                <span className="font-extrabold">Total</span>
                <span className="font-extrabold">{formatPeso(orderTotal(detail))}</span>
              </div>
            </div>
          </section>

          <div className="space-y-3">
            <section className="card p-4">
              <h2 className="text-sm font-extrabold">Buyer + payment</h2>
              <dl className="mt-2 space-y-1 text-sm text-stone-600">
                <div className="flex justify-between gap-2">
                  <dt className="font-semibold">Buyer</dt>
                  <dd className="text-right font-bold text-stone-800">{orderBuyer(detail)}</dd>
                </div>
                {detail.buyer_email ? (
                  <div className="flex justify-between gap-2">
                    <dt className="font-semibold">Email</dt>
                    <dd className="text-right">{detail.buyer_email}</dd>
                  </div>
                ) : null}
                {detail.buyer_phone ? (
                  <div className="flex justify-between gap-2">
                    <dt className="font-semibold">Phone</dt>
                    <dd className="text-right">{detail.buyer_phone}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-2">
                  <dt className="font-semibold">Payment</dt>
                  <dd className="text-right font-bold">{paymentText}</dd>
                </div>
              </dl>
            </section>

            <section className="card p-4">
              <h2 className="text-sm font-extrabold">Next step</h2>
              <ActionBar
                status={detail.status}
                mutate={(v) => mutation.mutate(v)}
                pending={mutation.isPending}
              />
              {mutation.isPending ? (
                <p className="mt-2 text-xs font-semibold text-stone-500">Saving…</p>
              ) : null}
            </section>

            <section className="card p-4">
              <h2 className="text-sm font-extrabold">Timeline</h2>
              <TimelineList entries={timeline} />
            </section>
          </div>
        </div>
      )}
    </StoreShell>
  );
}
