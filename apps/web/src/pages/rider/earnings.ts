export interface DeliveredEntry {
  id: string;
  total: number;
  at: number;
}

const STORAGE_KEY = 'kaoncdo:rider:delivered:v1';

export const SEED_NOTE =
  'Demo seed orders are not counted — totals are computed on-device from deliveries you complete in this app.';

export function loadDelivered(): DeliveredEntry[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');
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

const isToday = (at: number): boolean => {
  const d = new Date(at);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
};

export function todayStats(entries: DeliveredEntry[]): { count: number; sum: number } {
  return entries
    .filter((e) => isToday(e.at))
    .reduce(
      (a, e) => ({ count: a.count + 1, sum: a.sum + (Number.isFinite(e.total) ? e.total : 0) }),
      { count: 0, sum: 0 },
    );
}
