// Support API helpers (shared low-level bits imported from ../store/storeApi).
import { api } from '../../lib/api';
import { asRecord, pickList, toStr } from '../store/storeApi';

export interface Ticket {
  id: string; subject: string; priority: string; status: string;
  created_at: string | null; order_id: string | null; opener: string | null;
  message_count?: number | null;
}
export interface TicketMessage {
  id?: string | number; sender_role: string; body: string; created_at: string | null;
}
export interface TicketDetail { ticket: Ticket; messages: TicketMessage[] }
export interface SupportRider { id: string; name: string; status: string }

const SUPPORT_HEADERS: HeadersInit = { 'x-persona': 'support' };
const sGet = <T,>(path: string) => api<T>(path, { method: 'GET', headers: SUPPORT_HEADERS });
const sPost = (path: string, body: unknown = {}) =>
  api<unknown>(path, { method: 'POST', headers: SUPPORT_HEADERS, body: JSON.stringify(body) });

export function toNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
function toTicket(t: unknown, i: number): Ticket {
  const r = asRecord(t);
  return {
    id: toStr(r.id) ?? `ticket-${i}`, subject: toStr(r.subject) ?? '(no subject)',
    priority: toStr(r.priority) ?? 'normal', status: toStr(r.status) ?? 'open',
    created_at: toStr(r.created_at ?? r.createdAt), order_id: toStr(r.order_id ?? r.orderId ?? r.order),
    opener: toStr(r.opener ?? r.opener_name ?? r.opener_email ?? r.openerName) ?? null,
    message_count: toNum(r.message_count ?? r.messageCount),
  };
}
export function normalizeTickets(payload: unknown): Ticket[] {
  return pickList<unknown>(payload, ['tickets']).map(toTicket);
}
export function normalizeTicketDetail(payload: unknown): TicketDetail | null {
  const root = asRecord(payload);
  if (!root.ticket) return null;
  const t = asRecord(root.ticket);
  const rawMsgs = Array.isArray(root.messages) ? root.messages : [];
  return {
    ticket: { ...toTicket(t, 0), id: toStr(t.id) ?? '', message_count: rawMsgs.length },
    messages: rawMsgs.map((m) => {
      const r = asRecord(m);
      return {
        id: (r.id as string | number | undefined) ?? undefined,
        sender_role: toStr(r.sender_role ?? r.senderRole) ?? 'unknown',
        body: toStr(r.body) ?? '', created_at: toStr(r.created_at ?? r.createdAt),
      } satisfies TicketMessage;
    }),
  };
}
export function normalizeSupportRiders(payload: unknown): SupportRider[] {
  return pickList<unknown>(payload, ['riders']).map((r, i) => {
    const rec = asRecord(r);
    return { id: toStr(rec.id) ?? `rider-${i}`, name: toStr(rec.name) ?? `Rider ${i + 1}`, status: toStr(rec.status) ?? 'unknown' };
  });
}

export type TicketFilter = 'open' | 'pending' | 'resolved' | 'all';
export function fetchTickets(status: TicketFilter): Promise<Ticket[]> {
  return sGet<unknown>(status === 'all' ? '/api/tickets' : `/api/tickets?status=${status}`).then(normalizeTickets);
}
export function fetchTicketDetail(id: string): Promise<TicketDetail | null> {
  return sGet<unknown>(`/api/tickets/${encodeURIComponent(id)}`).then(normalizeTicketDetail);
}
export function fetchOrderContext(orderId: string): Promise<Record<string, unknown> | null> {
  return sGet<Record<string, unknown>>(`/api/orders/${encodeURIComponent(orderId)}`).catch(() => null);
}
// GET /api/ops/live is operator-only: throws for support, UI falls back to manual rider-ID input.
export function fetchRidersForReassign(): Promise<SupportRider[]> {
  return sGet<unknown>('/api/ops/live').then(normalizeSupportRiders);
}
export function postTicketMessage(ticketId: string, body: string): Promise<unknown> {
  return sPost(`/api/tickets/${encodeURIComponent(ticketId)}/messages`, { body, sender_role: 'support' });
}
export function resolveTicket(ticketId: string): Promise<unknown> {
  return sPost(`/api/tickets/${encodeURIComponent(ticketId)}/resolve`);
}
export function refundTicket(ticketId: string): Promise<unknown> {
  return sPost(`/api/tickets/${encodeURIComponent(ticketId)}/refund`);
}
// Force-assign (support persona allowed by contract).
export function reassignOrder(orderId: string, riderId: string): Promise<unknown> {
  return sPost('/api/ops/assign', { orderId, riderId });
}
