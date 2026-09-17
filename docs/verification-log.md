# Verification log

## Pass 1 — 2026-09-17 04:48–05:30 UTC

- **Reviewer/verifier:** Muse Spark (opencode harness, orchestrator + 2 parallel
  verification subagents: UI-flows, static+data).
- **Commit verified:** `198c2df` (main). Manifest: `docs/VERIFY.md` (v1).
- **Seed baseline:** 14 users / 6 stores / 30 items / 8 orders / 3 tickets /
  2 promos / 7 reviews — identical before and after (all test rows deleted).

### Results

- Services: PASS (db+redis healthy, `/health` stores=6, web :5173 → 200).
- API matrix: 16/16 PASS on first run; 4 initial FAILs (A5 detail shape, A6
  store transitions, A6-invalid, A15 cancel) all re-proven as **test-script
  artifacts** on corrected re-run: detail payload nests under `order`,
  store PATCH is owner-scoped (`?ownerEmail=` required — Mang BBQ belongs to
  owner2), cancel returns `{order:{status:cancelled, payment_status:refunded}}`.
  Effective API: 19/19. Full loop placed→ready→assigned→PIN→delivered verified.
- UI flows (agent-browser, screenshots in temp `pwshot/vfy-*`): home, buyer
  browse→store→modal→cart→checkout→promo→place-order (₱208→₱174 KAON20, real
  order `e1d39a12` placed through UI), track map+PIN+timeline, store dashboard,
  rider home+active, ops map, support queue+thread, mobile 380px — ALL PASS.
- Static: `tsc --noEmit` clean (web + api). Hygiene PASS: tree clean, no `.env`
  or secrets tracked (seed passwords all `'stub'`, no CARTO key in repo).

### Anomalies / follow-ups

1. **Mystery order `11374f8a`** (GreenBowls FREESHIP COD, placed 04:45:24 UTC,
   3 expired offers, source unidentified — pre-dates this pass; possibly a
   leftover from an earlier agent smoke test). Removed with dependents;
   baseline restored. Follow-up: none unless it recurs.
2. **Third-party `auth.carto.com` XHR JSON.parse errors** — RESOLVED 2026-09-17
   ~06:30 UTC, no code change: `grep` finds zero carto/auth0 refs in
   `apps/`+`db/` (only this log + an AGENTS.md tile-provider note). After
   `agent-browser close --all` + fresh session with only app pages open,
   `errors --json` returns `[]`. Root cause was a stale CARTO signup tab in
   the old browser session (`errors` aggregates all sessions). Gotcha added
   to AGENTS.md.
3. Buyer track view shows no rider marker until first tracking ping exists
   (caption still references a rider dot) — RESOLVED 2026-09-17 ~06:45 UTC
   (`bf09f5d`, merged): deeper bug found via screenshot ground-truth —
   `store`/`items` memos never unwrapped `{order:...}`, so no store pin, no
   route, no Items section ever rendered. Fixed unwrap + rider marker now uses
   the latest real tracking ping (was status-interpolated) + caption is
   conditional (`Route via OSRM|Straight-line route…` + `· car icon = rider`
   only when pings exist). Verified on :5175 and merged :5173 with screenshots.
4. `agent-browser click` needs quoted `@refs` in PowerShell (`'@e3'`); `eval`
   strips double quotes (single-quote doubling works). Already in `~/.AGENTS.md`.
5. Verification-subagent UI reports need screenshot ground-truth: one report
   claimed an "orange route polyline" on the track page that the screenshot
   proves was never rendered (store-unwrap bug above). Always `Read` the
   screenshot image before trusting element/snapshot claims.

## Pass 2 — 2026-09-17 ~06:00–06:50 UTC (fixes for Pass 1 items 2+3)

- **Verifier:** Muse Spark, direct (all `Task` subagent spawns kept getting
  cancelled; a cancelled caption subagent had left uncommitted work in the
  `fix/track-rider-caption` worktree, which was reviewed, completed, and
  committed as `bf09f5d`).
- **Merges:** `b30273d` (caption/track-map) + `045612a` (carto docs).
- **Checks:** `tsc --noEmit` clean (web + api); seed baseline exact
  14/6/30/8/3/2/7; `/health` stores=6; web :5173 → 200. Dev servers had died
  mid-pass (nothing listening on :3001/:5173); restarted via
  `npm run dev:api` + `npm run dev:web`. No test rows created, nothing to clean.
- **UI proof:** `pwshot/vfy-caption-with-rider.png` (...008: route + store pin
  + rider marker + `Route via OSRM · car icon = rider`),
  `pwshot/vfy-caption-no-rider.png` (...007 preparing, 0 pings: `Route via
  OSRM`, no rider ref/marker), `pwshot/vfy-track-fixed-main.png` (merged code
  live on :5173).
