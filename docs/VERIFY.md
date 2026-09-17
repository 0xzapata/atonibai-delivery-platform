# KaonCDO verification manifest (v1)

Reusable pass/fail checklist for any agent verifying this repo. Mark each
item PASS/FAIL with evidence (command output, screenshot path, measured value).
Any FAIL must include the exact error + reproduction. After the pass, append a
durable note to `docs/verification-log.md` (time UTC, model, commit, results).

## 0. Prereqs

- Repo: `code/food-delivery-poc`, branch `main`, working tree clean.
- `docker compose up -d db redis` healthy; `.env` present (copy `.env.example`).
- API on :3001 (`npm run dev:api`), web on :5173 (`npm run dev:web`).
- No other process on :3001/:5173/:5432/:6379.

## 1. Services (all must be Up/healthy)

- [ ] `docker compose ps` → db + redis healthy.
- [ ] `GET :3001/health` → `{ok:true, stores:6}`.
- [ ] `GET :5173/` → 200, title "KaonCDO".

## 2. Seed baseline (before AND after the pass — must be identical)

```sql
SELECT 'users',count(*) FROM users UNION ALL SELECT 'stores',count(*)
FROM stores UNION ALL SELECT 'menu_items',count(*) FROM menu_items
UNION ALL SELECT 'orders',count(*) FROM orders
UNION ALL SELECT 'tickets',count(*) FROM tickets
UNION ALL SELECT 'promotions',count(*) FROM promotions;
```

Expected: users 14 · stores 6 · menu_items 30 · orders 8 · tickets 3 · promotions 2.
Any rows created during verification MUST be deleted afterwards.

## 3. API matrix (curl; `H` = `-Headers @{'x-persona'=...}`)

| # | Call | Expect |
|---|---|---|
| A1 | `GET /api/stores` (buyer) | 6 stores,6275533612009543699 lat/lng |
| A2 | `GET /api/stores/:id/menu` | categories→items→options→choices |
| A3 | `POST /api/orders` + fresh `Idempotency-Key` | 201-ish, totals = items+39+8/km+5%−promo, 4-digit PIN; repeat same key → SAME id (`deduped`) |
| A4 | Same body, `promoCode: BOGUS` | 400 |
| A5 | `GET /api/orders/:id` | items+store+payment+offer+tracking keys present |
| A6 | PATCH store flow accept→preparing→ready (store_owner) | status advances; wrong transition → 409 |
| A7 | `GET /api/ops/live` (operator AND support) | riders + active_orders; buyer persona → 403 |
| A8 | `POST /api/ops/assign` (operator) | order → rider_assigned |
| A9 | `POST pickup` wrong PIN → 400; right PIN → picked_up | enforced |
| A10 | `POST deliver` → delivered; second cancel → 409 | enforced |
| A11 | `GET /api/rider/offers`, `/api/rider/active` (rider) | shape `{offers}`, `{order}` |
| A12 | `POST /api/tracking` → `GET .../tracking` | point round-trips |
| A13 | tickets: create→message→refund→resolve (support) | statuses advance; list filters work |
| A14 | `POST /api/orders/:id/review` | stored |
| A15 | cancel before preparing → cancelled+refunded | enforced |

## 4. UI flows (agent-browser @ :5173, screenshot each)

- [ ] `/` persona home renders 5 cards + API status green.
- [ ] `/buyer` lists 6 stores w/ images; search/filter/sort work.
- [ ] `/buyer/s/:id` menu + options modal → cart; `/buyer/checkout` promo +
      mock pay → places order → `/buyer/track/:id` shows map + PIN + timeline.
- [ ] `/store` dashboard stats match seed/active; accept→ready advances an order.
- [ ] `/rider` online toggle; offer accept; `active` PIN → simulate run → delivered.
- [ ] `/ops` map shows riders; assign modal works; broadcast + promo create work.
- [] `/support` queue filters; thread reply + canned chips; refund/resolve/reassign.
- [ ] No page errors: `agent-browser errors` empty after each flow.
- [ ] Mobile 380px: `/buyer` single column, header nav scrollable, no overlap.

## 5. Static checks

- [ ] `npx tsc --noEmit -p apps/web/tsconfig.json` clean.
- [ ] `npx tsc --noEmit -p apps/api/tsconfig.json` clean.
- [ ] `git status` clean except intended files; no `.env`/logs/secrets committed.

## 6. Durable note

Append to `docs/verification-log.md`: date-time UTC, model name, commit hash,
per-section PASS/FAIL + evidence paths, seed counts before/after, follow-ups.
