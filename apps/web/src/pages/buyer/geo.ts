/** Buyer drop-off is pinned to Centrio for the POC (non-editable). */
export const CENTRIO_LAT = 8.4861;
export const CENTRIO_LNG = 124.648;

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Mock ETA from store distance when the API has no ETA feed. */
export function mockEtaMin(storeLat: number | null, storeLng: number | null): number {
  if (storeLat === null || storeLng === null) return 25;
  const km = haversineKm(storeLat, storeLng, CENTRIO_LAT, CENTRIO_LNG);
  return Math.max(10, Math.round(12 + km * 4));
}

export function distanceKm(storeLat: number | null, storeLng: number | null): number | null {
  if (storeLat === null || storeLng === null) return null;
  return haversineKm(storeLat, storeLng, CENTRIO_LAT, CENTRIO_LNG);
}

export interface OsrmPoint {
  lat: number;
  lng: number;
}

/**
 * Driving route (store -> buyer) via the public OSRM demo server.
 * Returns [lat, lng] pairs, or null so callers can fall back to a straight line.
 */
export async function fetchRoute(
  storeLng: number,
  storeLat: number,
  buyerLng: number,
  buyerLat: number,
): Promise<Array<[number, number]> | null> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${storeLng},${storeLat};${buyerLng},${buyerLat}?overview=full&geometries=geojson`;
  // Issue #13 (partial): the demo server can hang — cap the wait so the UI
  // falls back to a straight line instead of stalling the map.
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      routes?: Array<{ geometry?: { coordinates?: Array<[number, number]> } }>;
    };
    const coords = data.routes?.[0]?.geometry?.coordinates;
    if (!coords || coords.length === 0) return null;
    return coords.map(([lng, lat]) => [lat, lng] as [number, number]);
  } catch {
    return null;
  }
}
