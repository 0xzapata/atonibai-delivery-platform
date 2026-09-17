// Rider earnings: client-side only. Deliveries completed in this app session
// are appended to localStorage; today's count + sum derive from that list.
export interface DeliveredEntry {
  id: string;
  total: number;
  at: number;
}

const STORAGE_KEY = 'kaoncdo:rider:delivered:v1';

/** Explainer shown under the earnings card (seed orders are never counted). */
export const SEED_NOTE =
  'Demo seed orders are not counted — totals are computed on-device from deliveries you complete in this app.';

export function loadDelivered(): DeliveredEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is DeliveredEntry =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as { id?: unknown }).id === 'string' &&
        typeof (e as { total?: unknown }).total === 'number' &&
        typeof (e as { at?: unknown }).at === 'number',
    );
  } catch {
    return [];
  }
}

export function recordDelivered(id: string, total: number): DeliveredEntry[] {
  const next = [...loadDelivered().filter((e) => e.id !== id), { id, total, at: Date.now() }];
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(-200)));
  } catch {
    // Storage unavailable — caller still gets the in-memory list.
  }
  return next;
}

function isToday(at: number): boolean {
  const d = new Date(at);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function todayStats(entries: DeliveredEntry[]): { count: number; sum: number } {
  return entries
    .filter((e) => isToday(e.at))
    .reduce(
      (acc, e) => ({ count: acc.count + 1, sum: acc.sum + (Number.isFinite(e.total) ? e.total : 0) }),
      { count: 0, sum: 0 },
    );
}
