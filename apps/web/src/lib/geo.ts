/** Buyer drop-off is pinned to Centrio for the POC (non-editable). */
export const CENTRIO_LAT = 8.4861;
export const CENTRIO_LNG = 124.648;

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(bLat - aLat) / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export const distanceKm = (lat: number | null, lng: number | null): number | null =>
  lat === null || lng === null ? null : haversineKm(lat, lng, CENTRIO_LAT, CENTRIO_LNG);

/** Mock ETA from store distance when the API has no ETA feed. */
export const mockEtaMin = (lat: number | null, lng: number | null): number => {
  const km = distanceKm(lat, lng);
  return km === null ? 25 : Math.max(10, Math.round(12 + km * 4));
};

/** Driving route via the public OSRM demo server. Null → caller falls back to a straight line. */
export async function fetchRoute(fromLng: number, fromLat: number, toLng: number, toLat: number): Promise<Array<[number, number]> | null> {
  const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`);
  if (!res.ok) return null;
  const data = (await res.json()) as { routes?: Array<{ geometry?: { coordinates?: Array<[number, number]> } }> };
  const coords = data.routes?.[0]?.geometry?.coordinates;
  return coords?.length ? coords.map(([lng, lat]) => [lat, lng] as [number, number]) : null;
}

/** Compass bearing in degrees from a -> b (for the car marker + tracking pings). */
export function bearingDeg(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLng = rad(bLng - aLng);
  const y = Math.sin(dLng) * Math.cos(rad(bLat));
  const x = Math.cos(rad(aLat)) * Math.sin(rad(bLat)) - Math.sin(rad(aLat)) * Math.cos(rad(bLat)) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
