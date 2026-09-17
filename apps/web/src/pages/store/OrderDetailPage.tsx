// Order detail: items/options, totals, buyer + payment, timeline, next-step actions.
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
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

export default function OrderDetailPage() {
  const params = useParams();
  const id = params.id ?? '';
  const toast = useToast();
  const queryClient = useQueryClient();
  const [rejectReason, setRejectReason] = useState<RejectReason>('too_busy');

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
      const labels: Record<StoreAction, string> = {
        accept: 'accepted',
        reject: 'rejected',
        preparing: 'moved to preparing',
        ready: 'marked ready',
      };
      toast.push(`Order ${id} ${labels[vars.action]}`);
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
    const p = detail.payment;
    const method = (p?.method ?? detail.payment_method ?? '').toUpperCase();
    const state = p?.status ?? detail.payment_status ?? '';
    return [method, state ? `· ${state}` : ''].join(' ').trim() || '—';
  }, [detail]);

  const moneyRows = useMemo(() => {
    if (!detail) return [];
    const rows: Array<{ label: string; value: number }> = [];
    const push = (label: string, v: unknown) => {
      if (v !== undefined && v !== null && v !== '') {
        rows.push({ label, value: toNumber(v, 0) });
      }
    };
    push('Subtotal', detail.subtotal);
    push('Delivery fee', detail.delivery_fee);
    push('Service fee', detail.service_fee);
    const disc = toNumber(detail.discount ?? 0, 0);
    if (disc > 0) rows.push({ label: 'Discount', value: -disc });
    return rows;
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
            {items.length === 0 ? (
              <EmptyState message="No line items returned for this order." />
            ) : (
              <ul className="divide-y divide-stone-100">
                {items.map((it, i) => {
                  const optList = Array.isArray(it.options) ? it.options : [];
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
                      {optList.length > 0 ? (
                        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs font-semibold text-stone-500">
                          {optList.map((o, j) => (
                            <li key={j}>{optionLabel(o)}</li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}

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
              {detail.status === 'placed' ? (
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
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate({ action: 'accept' })}
                      className="flex-1 rounded-full px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                      style={{ backgroundColor: 'var(--accent)' }}
                    >
                      Accept order
                    </button>
                    <button
                      type="button"
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate({ action: 'reject', reason: rejectReason })}
                      className="flex-1 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ) : detail.status === 'store_accepted' ? (
                <button
                  type="button"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate({ action: 'preparing' })}
                  className="mt-2 w-full rounded-full bg-stone-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                  Start preparing
                </button>
              ) : detail.status === 'preparing' ? (
                <button
                  type="button"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate({ action: 'ready' })}
                  className="mt-2 w-full rounded-full px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                  style={{ backgroundColor: 'var(--accent)' }}
                >
                  Mark ready
                </button>
              ) : (
                <p className="mt-2 rounded-xl bg-stone-100 px-3 py-2 text-xs font-bold text-stone-500">
                  No store actions for status “{detail.status}” — rider / completion flow owns it
                  from here.
                </p>
              )}
              {mutation.isPending ? (
                <p className="mt-2 text-xs font-semibold text-stone-500">Saving…</p>
              ) : null}
            </section>

            <section className="card p-4">
              <h2 className="text-sm font-extrabold">Timeline</h2>
              {timeline.length === 0 ? (
                <p className="mt-2 text-sm font-semibold text-stone-400">
                  No timeline events yet.
                </p>
              ) : (
                <ol className="mt-2 space-y-2">
                  {timeline.map((e, i) => (
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
              )}
            </section>
          </div>
        </div>
      )}
    </StoreShell>
  );
}
