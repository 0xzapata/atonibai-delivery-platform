import { PERSONA_STORAGE_KEY } from './persona';

/** Base URL for the API. Empty in dev (Vite proxies /api + /health). */
export const API_BASE: string = import.meta.env.VITE_API_URL ?? '';

/**
 * JSON fetch wrapper. Attaches the stub-auth `x-persona` header read from
 * localStorage so the API can act on behalf of the selected demo persona.
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let persona = 'buyer';
  try {
    persona = window.localStorage.getItem(PERSONA_STORAGE_KEY) ?? 'buyer';
  } catch {
    // Storage unavailable — fall back to the default buyer persona.
  }

  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (!headers.has('x-persona')) {
    headers.set('x-persona', persona);
  }

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status} ${path}${body ? `: ${body}` : ''}`);
  }

  return (await res.json()) as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return api<T>(path, { method: 'GET' });
}

export interface HealthResponse {
  ok: boolean;
  service: string;
  stores: number;
}

export interface StoreSummary {
  id: string | number;
  name: string;
  cuisine?: string | null;
  image?: string | null;
  rating?: number | null;
  delivery_fee?: number | null;
  is_open?: boolean | null;
  lat?: number | null;
  lng?: number | null;
}

export type StoresPayload = { stores: StoreSummary[] } | StoreSummary[];

export function countStores(payload: StoresPayload | undefined): number | null {
  if (!payload) return null;
  if (Array.isArray(payload)) return payload.length;
  if (Array.isArray(payload.stores)) return payload.stores.length;
  return null;
}
