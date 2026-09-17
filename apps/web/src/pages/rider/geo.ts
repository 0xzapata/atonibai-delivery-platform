export async function fetchRoute(
  fromLng: number,
  fromLat: number,
  toLng: number,
  toLat: number,
): Promise<Array<[number, number]> | null> {
  const res = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`,
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    routes?: Array<{ geometry?: { coordinates?: Array<[number, number]> } }>;
  };
  const coords = data.routes?.[0]?.geometry?.coordinates;
  if (!coords || coords.length === 0) return null;
  return coords.map(([lng, lat]) => [lat, lng] as [number, number]);
}

export function bearingDeg(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLng = rad(bLng - aLng);
  const y = Math.sin(dLng) * Math.cos(rad(bLat));
  const x =
    Math.cos(rad(aLat)) * Math.sin(rad(bLat)) -
    Math.sin(rad(aLat)) * Math.cos(rad(bLat)) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
