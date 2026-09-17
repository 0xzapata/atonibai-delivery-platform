# KaonCDO — agent notes (learnings from the build)

## Gotchas

- SVG `<img width>` is ignored under Tailwind preflight (car rendered at full
  1024px). Always size SVG markers with explicit inline CSS width/height and
  verify the rendered box via `getBoundingClientRect` — never trust code.
- Tile providers: CARTO basemaps require API keys (2025+). Esri WorldStreetMap /
  WorldImagery, OSM standard, and OSM HOT are keyless. Screenshot tiles on
  first load and look for "API KEY REQUIRED" watermarks. Routes: public OSRM
  demo server with a straight-line fallback (`fetchRoute` in buyer `geo.ts`).
- Check CLI platform support before promising it (`agentmail-cli` is
  win32-incompatible — REST-via-Node was the fallback).
- `tsx watch` auto-reloads the API on file change (new PID serves new routes);
  verify with a request, don't assume a restart is needed.
- Rider marker art: `apps/web/public/car.svg` (user-supplied top-down render,
  nose-up so `rotate(bearing)` steers it). Buyer track page uses a 36px static
  version; rider active page uses 48px rotating.

## Orchestration (what worked)

- Contract-first parallel builds: API + buyer + store were built simultaneously
  against the PLAN.md §4 contract. Shared `App.tsx` stayed orchestrator-owned;
  each area exports `*Routes: RouteObject[]` for the orchestrator to mount.
- Agent done = verify (tsc + smoke) + commit hash + report + seed baseline
  restored (orders back to 8). Counts check:
  `psql -c "SELECT count(*) FROM orders;"`.
- Web riders have no GPS: the rider app has a Simulate-run mode that animates
  along the OSRM route and POSTs `/api/tracking` pings.
- Env/ports: DB `localhost:5432` (kaon/kaonpw/kaoncdo), Redis `:6379`,
  API `:3001`, web `:5173` (proxies `/api`, `/health`). `Idempotency-Key`
  is in-memory (single instance). Prices are whole pesos (int).
- One `question` call (24/32/48px) beat another screenshot round-trip for
  ambiguous sizing asks.
