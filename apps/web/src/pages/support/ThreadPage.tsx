import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { asRecord, toStr } from '../../lib/api';
import {
  fetchOrderContext, fetchRidersForReassign, fetchTicketDetail,
  postTicketMessage, reassignOrder, refundTicket, resolveTicket,
} from './supportApi';
import {
  EmptyState, ErrorState, OrderStatusPill, PriorityBadge, SupportShell,
  TicketStatusBadge, formatDateTime, formatPeso, shortId, useToast,
} from './ui';

const CANNED = ['Rider is on the way', 'Refund issued', 'Reassigning rider'] as const;

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function OrderContextCard({ orderId }: { orderId: string }) {
  const orderQuery = useQuery({
    queryKey: ['support', 'order', orderId], queryFn: () => fetchOrderContext(orderId),
    refetchInterval: 10_000, retry: false, refetchOnWindowFocus: false,
  });
  if (orderQuery.isPending) {
    return <div className="card animate-pulse p-4 text-sm font-semibold text-stone-500">Loading order context…</div>;
  }
  if (orderQuery.isError || !orderQuery.data) {
    return (
      <div className="card p-4">
        <h2 className="text-sm font-extrabold">Order #{shortId(orderId)}</h2>
        <p className="mt-1 text-xs font-semibold text-stone-500">Order context unavailable (GET /api/orders/:id) — actions below still work.</p>
      </div>
    );
  }
  const o = orderQuery.data;
  const status = toStr(o.status) ?? 'unknown';
  const total = num(o.total ?? o.grand_total);
  const paymentStatus = toStr(o.payment_status ?? o.paymentStatus);
  const store = asRecord(o.store);
  const offer = asRecord(o.latest_offer);
  const items = Array.isArray(o.items) ? o.items : [];
  const riderName = toStr(offer.rider_name ?? offer.riderName);
  const rows: Array<[string, string]> = [
    ['Store', toStr(store.name) ?? '—'],
    ['Rider (latest offer)', `${riderName ?? '—'}${toStr(offer.status) ? ` · ${toStr(offer.status)}` : ''}`],
    ['Items', items.length > 0 ? `${items.length} line${items.length === 1 ? '' : 's'}` : '—'],
    ['Placed', formatDateTime(toStr(o.created_at ?? o.createdAt))],
  ];
  return (
    <div className="card space-y-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-extrabold">Order #{shortId(orderId)}</h2>
        <OrderStatusPill status={status} />
        {paymentStatus && <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-bold text-stone-600">pay: {paymentStatus}</span>}
        <span className="ml-auto text-sm font-extrabold">{total !== null ? formatPeso(total) : '—'}</span>
      </div>
      <dl className="grid grid-cols-1 gap-1 text-xs font-semibold text-stone-600 sm:grid-cols-2">
        {rows.map(([k, v]) => <div key={k}><dt className="text-stone-400">{k}</dt><dd>{v}</dd></div>)}
      </dl>
    </div>
  );
}

function ReassignModal({ orderId, onClose }: { orderId: string; onClose: (done: boolean) => void }) {
  const toast = useToast();
  const ridersQuery = useQuery({
    queryKey: ['support', 'riders'], queryFn: fetchRidersForReassign,
    retry: false, refetchOnWindowFocus: false, staleTime: 30_000,
  });
  const [riderId, setRiderId] = useState('');
  const [manualId, setManualId] = useState('');
  const [sending, setSending] = useState(false);
  const riders = ridersQuery.data ?? [];
  async function submit() {
    const target = riderId || manualId.trim();
    if (!target) { toast.push('Pick a rider or paste a rider ID', 'err'); return; }
    setSending(true);
    try {
      await reassignOrder(orderId, target);
      toast.push(`Order #${shortId(orderId)} reassigned`, 'ok');
      onClose(true);
    } catch (e) { toast.push(e instanceof Error ? e.message : 'Reassign failed', 'err'); }
    finally { setSending(false); }
  }
  return (
    <div role="dialog" aria-modal="true" aria-label={`Reassign order ${orderId}`}
      className="fixed inset-0 z-[900] flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => onClose(false)}>
      <div className="card w-full max-w-md space-y-3 p-5" onClick={(e) => e.stopPropagation()}>
        <div>
          <h2 className="text-base font-extrabold">Reassign order #{shortId(orderId)}</h2>
          <p className="mt-0.5 text-xs text-stone-500">POST /api/ops/assign with the support persona.</p>
        </div>
        {ridersQuery.isSuccess && riders.length > 0 ? (
          <label className="block text-sm font-bold">Rider
            <select value={riderId} onChange={(e) => { setRiderId(e.target.value); if (e.target.value) setManualId(''); }}
              className="mt-1 w-full rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-emerald-500">
              <option value="">Select a rider…</option>
              {riders.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.status}</option>)}
            </select>
          </label>
        ) : (
          <p className="rounded-xl bg-stone-100 px-3 py-2 text-xs font-semibold text-stone-600">
            {ridersQuery.isPending ? 'Loading rider directory…' : 'Rider directory is operator-only — paste a rider ID below.'}
          </p>
        )}
        <label className="block text-sm font-bold">{riders.length > 0 ? 'Or rider ID (UUID)' : 'Rider ID (UUID)'}
          <input value={manualId} placeholder="e.g. 3fa85f64-5717-4562-b3fc-2c963f66afa6"
            onChange={(e) => { setManualId(e.target.value); if (e.target.value.trim()) setRiderId(''); }}
            className="mt-1 w-full rounded-2xl border border-stone-200 bg-white px-3 py-2 font-mono text-xs outline-none focus:border-emerald-500" />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => onClose(false)} className="rounded-full px-4 py-2 text-sm font-bold text-stone-600 ring-1 ring-stone-200">Cancel</button>
          <button type="button" onClick={() => void submit()} disabled={sending}
            className="rounded-full px-4 py-2 text-sm font-extrabold text-white disabled:opacity-60" style={{ backgroundColor: 'var(--accent)' }}>
            {sending ? 'Reassigning…' : 'Reassign'}
          </button>
        </div>
      </div>
    </div>
  );
}

const BUBBLE: Record<string, string> = {
  mine: 'ml-auto bg-emerald-600 text-white',
  theirs: 'bg-stone-100 text-stone-800',
};
function MessageList({ messages }: { messages: Array<{ id?: string | number; sender_role: string; body: string; created_at: string | null }> }) {
  if (messages.length === 0) return <EmptyState message="No messages yet — send the first reply below." />;
  return (
    <ol className="space-y-2">
      {messages.map((m, i) => {
        const mine = m.sender_role.trim().toLowerCase() === 'support';
        return (
          <li key={String(m.id ?? i)} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${mine ? BUBBLE.mine : BUBBLE.theirs}`}>
            <p className={`text-[11px] font-bold ${mine ? 'text-emerald-100' : 'text-stone-400'}`}>
              {m.sender_role}{m.created_at ? ` · ${formatDateTime(m.created_at)}` : ''}
            </p>
            <p className="mt-0.5 font-medium whitespace-pre-wrap">{m.body}</p>
          </li>
        );
      })}
    </ol>
  );
}

function ThreadInner({ ticketId }: { ticketId: string }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [acting, setActing] = useState<'resolve' | 'refund' | null>(null);
  const [reassignOpen, setReassignOpen] = useState(false);
  const detailQuery = useQuery({
    queryKey: ['support', 'ticket', ticketId], queryFn: () => fetchTicketDetail(ticketId),
    refetchInterval: 6_000, retry: false, refetchOnWindowFocus: false,
  });
  const detail = detailQuery.data;
  const ticket = detail?.ticket ?? null;
  const messages = detail?.messages ?? [];

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['support', 'ticket', ticketId] });
    await queryClient.invalidateQueries({ queryKey: ['support', 'tickets'] });
  }
  async function runAct(kind: 'resolve' | 'refund', fn: () => Promise<unknown>, okMsg: string, extraInvalidation?: string) {
    setActing(kind);
    try {
      await fn();
      toast.push(okMsg, 'ok');
      await refresh();
      if (extraInvalidation) await queryClient.invalidateQueries({ queryKey: ['support', 'order', extraInvalidation] });
    } catch (e) { toast.push(e instanceof Error ? e.message : `${okMsg} failed`, 'err'); }
    finally { setActing(null); }
  }
  async function sendReply() {
    const body = draft.trim();
    if (!body) { toast.push('Type a reply first', 'err'); return; }
    setSending(true);
    try {
      await postTicketMessage(ticketId, body);
      setDraft('');
      toast.push('Reply sent', 'ok');
      await refresh();
    } catch (e) { toast.push(e instanceof Error ? e.message : 'Reply failed', 'err'); }
    finally { setSending(false); }
  }
  function needOrder(): string | null {
    if (!ticket?.order_id) { toast.push('Ticket has no linked order — refund unavailable', 'err'); return null; }
    return ticket.order_id;
  }

  const actions: Array<{ key: string; label: string; busyLabel: string; busy: boolean; disabled: boolean; title: string; cls: string; onClick: () => void }> = ticket ? [
    { key: 'resolve', label: 'Resolve', busyLabel: 'Resolving…', busy: acting === 'resolve',
      disabled: acting !== null || ticket.status.toLowerCase() === 'resolved', title: 'Resolve ticket',
      cls: 'bg-stone-900 text-white', onClick: () => void runAct('resolve', () => resolveTicket(ticketId), 'Ticket resolved') },
    { key: 'refund', label: 'Refund', busyLabel: 'Refunding…', busy: acting === 'refund',
      disabled: acting !== null || !ticket.order_id, title: ticket.order_id ? 'Refund the linked order' : 'No linked order',
      cls: 'bg-amber-500 text-white', onClick: () => { const oid = needOrder(); if (oid) void runAct('refund', () => refundTicket(ticketId), 'Refund issued', oid); } },
    { key: 'reassign', label: 'Reassign rider', busyLabel: 'Reassign rider', busy: false,
      disabled: !ticket.order_id, title: ticket.order_id ? 'Force-assign a rider' : 'No linked order',
      cls: 'text-stone-700 ring-1 ring-stone-300',
      onClick: () => {
        if (!ticket.order_id) { toast.push('Ticket has no linked order — reassign unavailable', 'err'); return; }
        setReassignOpen(true);
      } },
  ] : [];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link to=".." className="rounded-full bg-white px-3 py-1.5 text-sm font-bold ring-1 ring-stone-200">← Queue</Link>
        <span className="text-[11px] font-semibold text-stone-400">live · 6s poll</span>
      </div>
      {detailQuery.isPending && <div className="card animate-pulse p-6 text-sm text-stone-500">Loading thread…</div>}
      {detailQuery.isError && <ErrorState message="Couldn't load this ticket — is the API running at localhost:3001?" onRetry={() => void detailQuery.refetch()} />}
      {detailQuery.isSuccess && !ticket && <EmptyState message="Ticket not found — it may have been deleted." />}
      {ticket && (
        <>
          <div className="card space-y-2 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <TicketStatusBadge status={ticket.status} />
              <PriorityBadge priority={ticket.priority} />
              <span className="ml-auto text-xs font-semibold text-stone-400">{formatDateTime(ticket.created_at)}</span>
            </div>
            <h1 className="text-lg font-extrabold tracking-tight">{ticket.subject}</h1>
            <p className="text-xs font-semibold text-stone-500">
              #{shortId(ticket.id)}{ticket.order_id ? ` · order #${shortId(ticket.order_id)}` : ' · no linked order'}{ticket.opener ? ` · ${ticket.opener}` : ''}
            </p>
          </div>
          {ticket.order_id && <OrderContextCard orderId={ticket.order_id} />}
          <div className="card space-y-2 p-4">
            <h2 className="text-sm font-extrabold">Messages{' '}
              <span className="ml-1 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-bold text-stone-500">{messages.length}</span>
            </h2>
            <MessageList messages={messages} />
          </div>
          <div className="card space-y-2 p-4">
            <h2 className="text-sm font-extrabold">Reply as support</h2>
            <div className="flex flex-wrap gap-1.5">
              {CANNED.map((c) => (
                <button key={c} type="button" onClick={() => setDraft(c)}
                  className="rounded-full bg-stone-100 px-3 py-1.5 text-xs font-bold text-stone-600 hover:bg-stone-200">{c}</button>
              ))}
            </div>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3}
              placeholder="Write a reply… (canned chips fill this box)"
              className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm outline-none focus:border-emerald-500" />
            <div className="flex justify-end">
              <button type="button" onClick={() => void sendReply()} disabled={sending}
                className="rounded-full px-4 py-2 text-sm font-extrabold text-white disabled:opacity-60" style={{ backgroundColor: 'var(--accent)' }}>
                {sending ? 'Sending…' : 'Send reply'}
              </button>
            </div>
          </div>
          <div className="card flex flex-wrap gap-2 p-4">
            {actions.map((a) => (
              <button key={a.key} type="button" onClick={a.onClick} disabled={a.disabled} title={a.title}
                className={`rounded-full px-4 py-2 text-sm font-bold disabled:opacity-50 ${a.cls}`}>
                {a.busy ? a.busyLabel : a.label}
              </button>
            ))}
          </div>
          {reassignOpen && ticket.order_id && (
            <ReassignModal orderId={ticket.order_id} onClose={(done) => {
              setReassignOpen(false);
              if (done) void queryClient.invalidateQueries({ queryKey: ['support', 'order', ticket.order_id as string] });
            }} />
          )}
        </>
      )}
    </div>
  );
}

export default function ThreadPage() {
  const { id = '' } = useParams();
  const ticketId = decodeURIComponent(id);
  return (
    <SupportShell>
      <ThreadInner key={ticketId} ticketId={ticketId} />
    </SupportShell>
  );
}
