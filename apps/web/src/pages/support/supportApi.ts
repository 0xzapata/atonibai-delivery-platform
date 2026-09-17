// Support API helpers. Reuses src/lib/api.ts and forces
// `x-persona: support` (api() keeps an explicit header).
// Exception: POST /api/ops/assign is allowed for support too (contract).
import { api } from '../../lib/api';

// ---------- types ----------

export interface Ticket {
  id: string;
  subject: string;
  priority: string;
  status: string;
  created_at: string | null;
  order_id: string | null;
  opener: string | null;
  message_count?: number | null;
}

export interface TicketMessage {
  id?: string | number;
  sender_role: string;
  body: string;
  created_at: string | null;
}

export interface TicketDetail {
  ticket: Ticket;
  messages: TicketMessage[];
}

export interface SupportRider {
  id: string;
  name: string;
  status: string;
}

const SUPPORT_HEADERS: HeadersInit = { 'x-persona': 'support' };

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

function toStr(v: unknown): string | null {
  if (typeof v === 'string' && v !== '') return v;
  if (typeof v === 'number') return String(v);
  return null;
}

function toNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// ---------- normalizers ----------

export function normalizeTickets(payload: unknown): Ticket[] {
  const root = asRecord(payload);
  const raw = Array.isArray(payload)
    ? payload
    : Array.isArray(root.tickets)
      ? root.tickets
      : [];
  return raw.map((t, i) => {
    const rec = asRecord(t);
    return {
      id: toStr(rec.id) ?? `ticket-${i}`,
      subject: toStr(rec.subject) ?? '(no subject)',
      priority: toStr(rec.priority) ?? 'normal',
      status: toStr(rec.status) ?? 'open',
      created_at: toStr(rec.created_at ?? rec.createdAt),
      order_id: toStr(rec.order_id ?? rec.orderId ?? rec.order),
      opener:
        toStr(rec.opener ?? rec.opener_name ?? rec.opener_email ?? rec.openerName) ??
        null,
      message_count: toNum(rec.message_count ?? rec.messageCount),
    } satisfies Ticket;
  });
}

export function normalizeTicketDetail(payload: unknown): TicketDetail | null {
  const root = asRecord(payload);
  if (!root.ticket) return null;
  const t = asRecord(root.ticket);
  const rawMsgs = Array.isArray(root.messages) ? root.messages : [];
  return {
    ticket: {
      id: toStr(t.id) ?? '',
      subject: toStr(t.subject) ?? '(no subject)',
      priority: toStr(t.priority) ?? 'normal',
      status: toStr(t.status) ?? 'open',
      created_at: toStr(t.created_at ?? t.createdAt),
      order_id: toStr(t.order_id ?? t.orderId),
      opener:
        toStr(t.opener ?? t.opener_name ?? t.opener_email) ?? null,
      message_count: rawMsgs.length,
    },
    messages: rawMsgs.map((m) => {
      const rec = asRecord(m);
      return {
        id: (rec.id as string | number | undefined) ?? undefined,
        sender_role: toStr(rec.sender_role ?? rec.senderRole) ?? 'unknown',
        body: toStr(rec.body) ?? '',
        created_at: toStr(rec.created_at ?? rec.createdAt),
      } satisfies TicketMessage;
    }),
  };
}

export function normalizeSupportRiders(payload: unknown): SupportRider[] {
  const root = asRecord(payload);
  const raw = Array.isArray(root.riders) ? root.riders : [];
  return raw.map((r, i) => {
    const rec = asRecord(r);
    return {
      id: toStr(rec.id) ?? `rider-${i}`,
      name: toStr(rec.name) ?? `Rider ${i + 1}`,
      status: toStr(rec.status) ?? 'unknown',
    } satisfies SupportRider;
  });
}

// ---------- query fns (exact contract paths) ----------

export type TicketFilter = 'open' | 'pending' | 'resolved' | 'all';

export function fetchTickets(status: TicketFilter): Promise<Ticket[]> {
  const path = status === 'all' ? '/api/tickets' : `/api/tickets?status=${status}`;
  return api<unknown>(path, { method: 'GET', headers: SUPPORT_HEADERS }).then(
    normalizeTickets,
  );
}

export function fetchTicketDetail(id: string): Promise<TicketDetail | null> {
  return api<unknown>(`/api/tickets/${encodeURIComponent(id)}`, {
    method: 'GET',
    headers: SUPPORT_HEADERS,
  }).then(normalizeTicketDetail);
}

/** Order context for a ticket (support persona). Null when unavailable. */
export function fetchOrderContext(
  orderId: string,
): Promise<Record<string, unknown> | null> {
  return api<Record<string, unknown>>(`/api/orders/${encodeURIComponent(orderId)}`, {
    method: 'GET',
    headers: SUPPORT_HEADERS,
  }).catch(() => null);
}

/**
 * Rider directory for the reassign picker. GET /api/ops/live is
 * operator-only, so this throws for support callers — the UI falls back
 * to a manual rider-ID input.
 */
export function fetchRidersForReassign(): Promise<SupportRider[]> {
  return api<unknown>('/api/ops/live', {
    method: 'GET',
    headers: SUPPORT_HEADERS,
  }).then(normalizeSupportRiders);
}

export function postTicketMessage(ticketId: string, body: string): Promise<unknown> {
  return api<unknown>(`/api/tickets/${encodeURIComponent(ticketId)}/messages`, {
    method: 'POST',
    headers: SUPPORT_HEADERS,
    body: JSON.stringify({ body, sender_role: 'support' }),
  });
}

export function resolveTicket(ticketId: string): Promise<unknown> {
  return api<unknown>(`/api/tickets/${encodeURIComponent(ticketId)}/resolve`, {
    method: 'POST',
    headers: SUPPORT_HEADERS,
    body: JSON.stringify({}),
  });
}

export function refundTicket(ticketId: string): Promise<unknown> {
  return api<unknown>(`/api/tickets/${encodeURIComponent(ticketId)}/refund`, {
    method: 'POST',
    headers: SUPPORT_HEADERS,
    body: JSON.stringify({}),
  });
}

/** Force-assign (support persona is allowed by the contract). */
export function reassignOrder(orderId: string, riderId: string): Promise<unknown> {
  return api<unknown>('/api/ops/assign', {
    method: 'POST',
    headers: SUPPORT_HEADERS,
    body: JSON.stringify({ orderId, riderId }),
  });
}
