export const CENTRIO_LAT = 8.4861;
export const CENTRIO_LNG = 124.648;

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(bLat - aLat) / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export const distanceKm = (lat: number | null, lng: number | null): number | null =>
  lat === null || lng === null ? null : haversineKm(lat, lng, CENTRIO_LAT, CENTRIO_LNG);

export const mockEtaMin = (lat: number | null, lng: number | null): number => {
  const km = distanceKm(lat, lng);
  return km === null ? 25 : Math.max(10, Math.round(12 + km * 4));
};

export async function fetchRoute(storeLng: number, storeLat: number, buyerLng: number, buyerLat: number): Promise<Array<[number, number]> | null> {
  const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${storeLng},${storeLat};${buyerLng},${buyerLat}?overview=full&geometries=geojson`);
  if (!res.ok) return null;
  const data = (await res.json()) as { routes?: Array<{ geometry?: { coordinates?: Array<[number, number]> } }> };
  const coords = data.routes?.[0]?.geometry?.coordinates;
  return coords?.length ? coords.map(([lng, lat]) => [lat, lng] as [number, number]) : null;
}
