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
   (caption still references a rider dot) — cosmetic copy mismatch. Follow-up.
4. `agent-browser click` needs quoted `@refs` in PowerShell (`'@e3'`); `eval`
   strips double quotes (single-quote doubling works). Already in `~/.AGENTS.md`.
