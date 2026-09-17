import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { fetchTickets, type TicketFilter } from './supportApi';
import {
  EmptyState, ErrorState, PriorityBadge, SupportShell,
  TicketStatusBadge, formatDateTime, shortId, useToast,
} from './ui';

const FILTERS: Array<{ key: TicketFilter; label: string }> = [
  { key: 'open', label: 'Open' }, { key: 'pending', label: 'Pending' },
  { key: 'resolved', label: 'Resolved' }, { key: 'all', label: 'All' },
];

function ticketMeta(t: { order_id: string | null; opener: string | null; created_at: string | null; message_count?: number | null }): string {
  const parts = [
    t.order_id ? `order #${shortId(t.order_id)}` : null,
    t.opener,
    formatDateTime(t.created_at),
  ].filter((p): p is string => !!p);
  const base = parts.join(' · ');
  return t.message_count !== null && t.message_count !== undefined
    ? `${base} · ${t.message_count} msg${t.message_count === 1 ? '' : 's'}`
    : base;
}

function QueueInner() {
  const toast = useToast();
  const [filter, setFilter] = useState<TicketFilter>('open');
  const ticketsQuery = useQuery({
    queryKey: ['support', 'tickets', filter], queryFn: () => fetchTickets(filter),
    refetchInterval: 6_000, retry: false, refetchOnWindowFocus: false,
  });
  const tickets = ticketsQuery.data ?? [];
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">Ticket queue{' '}
            <span className="ml-1 rounded-full bg-stone-200 px-2 py-0.5 align-middle text-xs font-bold text-stone-600">{tickets.length}</span>
          </h1>
          <p className="mt-1 text-sm text-stone-500">Filter by status — threads poll every 6s once opened.</p>
        </div>
        <div className="flex items-center gap-2">
          <div role="tablist" aria-label="Ticket status filter" className="flex rounded-full border border-stone-200 bg-white p-1 text-xs font-bold">
            {FILTERS.map((f) => (
              <button key={f.key} role="tab" aria-selected={filter === f.key} type="button" onClick={() => setFilter(f.key)}
                className={`rounded-full px-3 py-1.5 ${filter === f.key ? 'bg-stone-900 text-white' : 'text-stone-600'}`}>{f.label}</button>
            ))}
          </div>
          <button type="button" onClick={() => { void ticketsQuery.refetch(); toast.push('Refreshing…', 'ok'); }}
            className="rounded-full px-3 py-1.5 text-xs font-bold text-stone-600 ring-1 ring-stone-200">Refresh</button>
        </div>
      </div>
      {ticketsQuery.isPending && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card animate-pulse p-4">
              <div className="h-4 w-2/3 rounded bg-stone-200" />
              <div className="mt-2 h-3 w-1/3 rounded bg-stone-200" />
            </div>
          ))}
        </div>
      )}
      {ticketsQuery.isError && (
        <ErrorState message="Ticket queue unavailable — is the API running at localhost:3001? (GET /api/tickets polls every 6s once reachable.)" onRetry={() => void ticketsQuery.refetch()} />
      )}
      {ticketsQuery.isSuccess && tickets.length === 0 && <EmptyState message={`No ${filter === 'all' ? '' : `${filter} `}tickets right now.`} />}
      {ticketsQuery.isSuccess && tickets.length > 0 && (
        <ul className="space-y-2">
          {tickets.map((t) => (
            <li key={t.id}>
              <Link to={`t/${encodeURIComponent(t.id)}`} className="card flex flex-wrap items-center gap-2 p-4 transition hover:-translate-y-0.5 hover:shadow-md">
                <span className="text-sm font-extrabold">#{shortId(t.id)}</span>
                <TicketStatusBadge status={t.status} />
                <PriorityBadge priority={t.priority} />
                <span className="w-full truncate text-sm font-bold sm:w-auto sm:flex-1">{t.subject}</span>
                <span className="text-xs font-semibold text-stone-400">{ticketMeta(t)}</span>
                <span className="ml-auto text-sm font-extrabold text-emerald-700">Open →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function QueuePage() {
  return (
    <SupportShell>
      <QueueInner />
    </SupportShell>
  );
}
