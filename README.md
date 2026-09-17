# KaonCDO — Food Delivery POC

Full-stack food-delivery demo (buyer · store · rider · ops · support) over a
Cagayan de Oro map. React 19 + Vite 8 · Fastify 5 · Postgres 16 + PostGIS ·
Redis 7 · Leaflet + OSRM. Mock auth (persona switcher) and mock checkout —
no real passwords or payment gateways.

## Run

```powershell
Copy-Item .env.example .env
docker compose up --build        # web :8080 · api :3001 · db :5432 · redis :6379
```

Dev (faster iteration, DB/Redis still via compose):

```powershell
docker compose up -d db redis
npm install
npm run dev:api                   # :3001 (tsx watch, auto-reloads)
npm run dev:web                   # :5173 (proxies /api + /health to :3001)
```

Seeded on first `db` init (`db/init/`): 14 users · 6 stores · 30 items ·
8 orders · 3 tickets · 2 promos. Reset: `docker compose down -v` then `up`.

| Check | Command |
|---|---|
| API health | `curl localhost:3001/health` → `{ok, stores: 6}` |
| Stores | `GET /api/stores` (header `x-persona: buyer`) |
| Typecheck | `npx tsc --noEmit -p apps/web/tsconfig.json`, `... apps/api/...` |

## 5-minute demo script

1. **Buyer** (`/buyer`): search BBQ → Mang BBQ → add 2× Pork BBQ + add-ons →
   cart → promo `KAON20` → checkout (GCash-mock) → note the **pickup PIN**.
2. **Store** (`/store`): dashboard shows the order live → Accept → Preparing → Ready.
3. **Rider** (`/rider`): go Online → accept the offer → `active` → enter PIN →
   **Simulate run** (car animates Centrio→buyer, pings stored) → Delivered.
4. **Buyer track page**: watch status timeline advance; leave a review.
5. **Ops** (`/ops`): live map with all riders; reassign an order; post a broadcast.
6. **Support** (`/support`): open "rider late" ticket → canned reply → refund →
   resolve; buyer timeline reflects it.

## Layout

- `apps/web` — Vite SPA (`/buyer /store /rider /ops /support`, persona home `/`).
- `apps/api` — Fastify + Socket.IO (`src/server.ts`).
- `packages/shared` — statuses, fees, promos, peso fmt.
- `db/init` — `001_schema.sql`, `002_seed.sql`.
- `PLAN.md` — full product plan (stories, ERD, API contract).

## Notes

- Prices are whole pesos (int). Fees: base ₱39 + ₱8/km; promos `KAON20`, `FREESHIP`.
- Web riders have no GPS: the rider app simulates movement along OSRM routes.
- Idempotency-Key is in-memory (single instance POC).
- Tiles: Esri WorldStreetMap (no key). Routes: public OSRM demo server.
