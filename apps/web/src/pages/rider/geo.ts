// Rider-local route helpers (duplicated from buyer geo so this persona stays
// self-contained): OSRM driving route with straight-line fallback.
export async function fetchRoute(
  fromLng: number,
  fromLat: number,
  toLng: number,
  toLat: number,
): Promise<Array<[number, number]> | null> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    routes?: Array<{ geometry?: { coordinates?: Array<[number, number]> } }>;
  };
  const coords = data.routes?.[0]?.geometry?.coordinates;
  if (!coords || coords.length === 0) return null;
  return coords.map(([lng, lat]) => [lat, lng] as [number, number]);
}

/** Compass bearing in degrees from a -> b (for the car marker + tracking pings). */
export function bearingDeg(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLng = toRad(bLng - aLng);
  const y = Math.sin(dLng) * Math.cos(toRad(bLat));
  const x =
    Math.cos(toRad(aLat)) * Math.sin(toRad(bLat)) -
    Math.sin(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
