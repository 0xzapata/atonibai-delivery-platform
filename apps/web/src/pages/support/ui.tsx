// Shared support chrome: shell (persona guard), local toasts, badges, formatting.
// Light theme + `.card`, matching the store-owner look.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { Link } from 'react-router';
import { usePersona } from '../../lib/persona';

// ---------- formatting ----------

export function formatPeso(v: unknown): string {
  const n =
    typeof v === 'number' ? v : Number(String(v ?? 0).replace(/[^0-9.\-]/g, ''));
  const safe = Number.isFinite(n) ? n : 0;
  try {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
    }).format(safe);
  } catch {
    return `₱${safe.toFixed(2)}`;
  }
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
  } catch {
    return String(iso);
  }
}

export function shortId(id: string | number): string {
  const s = String(id);
  return s.length > 8 ? `${s.slice(0, 8)}…` : s;
}

// ---------- badges ----------

const STATUS_STYLES: Record<string, string> = {
  open: 'bg-amber-100 text-amber-800',
  pending: 'bg-sky-100 text-sky-800',
  resolved: 'bg-emerald-100 text-emerald-800',
};

export function TicketStatusBadge({ status }: { status: string }) {
  const key = status.trim().toLowerCase();
  const cls = STATUS_STYLES[key] ?? 'bg-stone-200 text-stone-700';
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${cls}`}>
      {status.replaceAll('_', ' ')}
    </span>
  );
}

const PRIORITY_STYLES: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  normal: 'bg-amber-100 text-amber-800',
  low: 'bg-stone-200 text-stone-600',
};

export function PriorityBadge({ priority }: { priority: string }) {
  const key = priority.trim().toLowerCase();
  const cls = PRIORITY_STYLES[key] ?? 'bg-stone-200 text-stone-700';
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-wide ${cls}`}
      title={`priority: ${priority}`}
    >
      {priority}
    </span>
  );
}

export function OrderStatusPill({ status }: { status: string }) {
  return (
    <span
      className="inline-block rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-800"
      title={status}
    >
      {status.replaceAll('_', ' ')}
    </span>
  );
}

// ---------- toast (tiny, local) ----------

interface ToastItem {
  id: number;
  message: string;
  kind: 'ok' | 'err';
}

const ToastCtx = createContext<{ push: (message: string, kind?: 'ok' | 'err') => void }>({
  push: () => {},
});

export function useToast() {
  return useContext(ToastCtx);
}

let toastSeq = 1;

function ToastViewport({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[1000] flex w-72 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`card pointer-events-auto px-3 py-2 text-sm font-semibold ${
            t.kind === 'err' ? 'border-red-200 text-red-700' : 'text-stone-800'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

// ---------- shell ----------

export function SupportShell({ children }: { children: ReactNode }) {
  const [, setPersona] = usePersona();
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((message: string, kind: 'ok' | 'err' = 'ok') => {
    const id = toastSeq++;
    setToasts((prev) => [...prev.slice(-3), { id, message, kind }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  useEffect(() => {
    try {
      setPersona('support');
    } catch {
      // ignore (private mode)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ToastCtx.Provider value={{ push }}>
      <div className="space-y-4">
        <div className="card flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link to="/" className="text-base font-extrabold tracking-tight">
              Kaon<span style={{ color: 'var(--accent)' }}>CDO</span>
              <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 align-middle text-xs font-bold text-stone-500">
                Support
              </span>
            </Link>
            <p className="mt-1 text-xs font-semibold text-stone-500">
              Ticket queue · threads · refunds · reassign
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            queue live · 6s poll
          </span>
        </div>
        {children}
        <ToastViewport toasts={toasts} />
      </div>
    </ToastCtx.Provider>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-center text-sm font-semibold text-stone-500">
      {message}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-center">
      <p className="text-sm font-bold text-red-700">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-full bg-stone-900 px-4 py-1.5 text-xs font-bold text-white"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}
