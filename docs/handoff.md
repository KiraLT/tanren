# Handoff — 2026-10-26 (night)

Cold-start order: `lead-playbook` skill → this file → `docs/tasks/step-2.md` Log tail → `git status --short`.
Older session history lives in git (`git log -- docs/handoff.md`); this file holds only what a new session needs.

## Where we are (2026-10-27 10:05)
**Production is live and current.** tanren.me (web), api.tanren.me (REST + Better Auth magic link),
mcp.tanren.me (MCP). Production = commit `25a0b64`, deployed 13:52 (DEPLOY-9: stateless auth ADR-0022 + migration 0006, legal pages, account-delete endpoint, Garmin schemas) from a clean worktree
whose root gate was green (159 files, 2002 tests); D1 at migration 0005 (applied by DEPLOY-5); the `*/5`
Strava-drain cron is registered (account subdomain `tanren-me`, `workers_dev` off). Live features: Plan week
"Logged N sets · volume" line (PLAN-LOG), W1 wordmark + the T mark as app/PWA icons (plan Amendment 15), OG
image + metas, polish round 5, Forge design, designed magic-link email,
sign-in gate (ADR-0019) with the signed-out **landing page** on web (ADR-0021, five generated
illustrations), Feed tab + activity detail + `/progress` (ADR-0017), guided programs with rep-count items
(ADR-0020: 15 of 24 Core 30 moves count reps), **Finish workout** on Today (inline after the set list on
phones since FIN-LAYOUT) plus auto-finish of stale sessions after a complete pull, Settings → Integrations
with Strava in **console mode** (ADR-0018; real export waits for the owner's Strava app keys), final 力
app icon / favicon / PWA icons + traced SVG mark, desktop polish round 4, brandbook artifact v3.

## Verified today (evidence in docs/tasks/step-2.md Log)
- Root `pnpm check` green at every deploy; DEPLOY-4 worktree run 156 files / 1948 tests (09:49).
- Live chunk check 09:55 (DEPLOY-4): root `_layout-d3f87cf8….js` carries the landing (`assets/landing` ×5,
  all five webps HTTP 200, "Sign in with a magic link"); `today-2b4c0ecf….js` carries "Finish workout" and
  the FIN-LAYOUT footer margin; `plan-570b4dd8….js` carries "Up next"; `__common-….js` carries the r4
  ListRow props and `finishStaleSessions`; `/health` → `{"ok":true}`. Route chunk names are listed inside
  the `entry-*.js` script that index.html names (not `index-*.js`); two `_layout-*` chunks exist and the
  landing is in the larger one.
- Designer verdicts: mobile-A r3 PASS, mobile-B r2 PASS, landing LAND-R PASS, desktop r4 PASS (all seven
  screens 4 at 1280/900). Code reviews: REV-PL (PROG-1/2, LOGO-2, FEED-7), PROG-R (PROG-3), REV-TF (Finish
  workout), REV-3 (Strava), REV-AF r2 (auto-finish), REV-POLISH (mobile pairs) all APPROVE; fixes landed,
  REV-POLISH should-fixes queued into polish round 5.
- Gallery https://claude.ai/artifact/YD5RTPNpuPy9hmpQLhJADQ v11 (14 sections, `desktop-r4` K1–K62; source tracked at
  `docs/design/screens/tanren-screens.html`; `node docs/design/gallery.mjs --publish` prints the files map).
  Brandbook https://claude.ai/artifact/S6ngEL7NHXU1LaMECafJYa v3.

## Live at hand-off (2026-10-27 15:36, written for a context compaction; agent ids in the scratchpad `live-agents.txt`)
**Production = `bdf7da1` (DEPLOY-15 15:31).** Live today, in order: DEPLOY-9 stateless auth + legal pages + account delete, DEPLOY-10/11 consent pages in Forge + auth hardening + display font, DEPLOY-12 Garmin import (migration 0007) + seal binding + the 12-Week Lean Build data, DEPLOY-13 Garmin pull sized for the Free plan, DEPLOY-14 remaining security items, DEPLOY-15 slim cron runtime. HEAD = production + docs. The WORKING TREE holds the uncommitted v6 work of four teams (see 1).
**Owner rules in force:** every ask in its own bold line; NEVER mention the Resend or Garmin key rotation; no legacy (Amendment 23); breaking changes = migrate live D1 first; the owner wants to reload VS Code — only at a checkpoint with no live agents.

**Resume checklist (in order):**
1. **Combined v6 commit** the moment the programs TL reports "P-S1 landed" (migration 0009; it turns the tree green — today the only reds are `program` in `SyncTable` before its table): run `pnpm check` from the tree; if green, `git add -A` EXCEPT files no team listed (none expected) and commit ONE "v6 nutrition + programs foundation" commit: N-F0 (shared nutrition, sync members, mobile v5), nutri-server (0008, FoodEntryRepo, 4 MCP tools, time/localDate), nutri-today W1 (FoodEntryRepo/NutritionRepo/hooks, NutritionStrip), nutri-food W1+W2 (quick-add, FoodLog, settings nutrition; their FIX-1 may still be in flight — ask the TL first), programs P-F0/P-M1/P-S1 (program table, swaps, usePrograms, migration 0009). Before `git add`, re-check with each live TL that nothing of theirs is mid-edit (playbook (6)/(8); two leaks today came from staging a file a live team was editing). Then DEPLOY-16 with `MIGRATE=1 scratchpad/deploy.sh` (0008 + 0009 add only), verify `/mcp` tools/list = 13 (+9 after P-S2), `/health`, then a bold line to the owner: nutrition tools are live in the Claude connector.
2. **Teams still running** (ids in `live-agents.txt`): nutri-today W2 (N-M3 `/health` + REV-1, then designer N-MD + captures → commit), nutri-food (FIX-1 → REV-2 → commit; it owns `app/health/add.tsx`, `settings/nutrition.tsx`, `components/health/{QuickAddSheet,FoodLog,...}`), programs (P-S2 MCP program tools after P-S1 → P-M3 editor → P-M4 swap sheet → P-R → P-Q). Accept each final report, commit per team (hunk-stage shared files), deploy, publish the gallery (`node docs/design/gallery.mjs docs/design/screens/tanren-screens.html --write`, Artifact URL in memory `tanren-review-gallery`, sections `nutrition` N1–N24 and `programs` PG*). Then INT-N (the v6 sheet's integration task incl. the `## INT-N addenda` doc truth-ups), INT-R ∥ N-QA, and the owner-facing e2e (photo → `log_food` → Today strip).
3. **Cron CPU question (owner asked twice):** facts in `docs/research/2026-10-27-cron-tick-cpu.md`; idle tick 28–30 ms before GM-F2, outcome ok; the tail `$S/tail-cron2.json` (15:35/15:40 ticks, post-diet) was running at compaction — parse it as concatenated pretty JSON (not JSONL) and report before/after to the owner; recommendation on file: accept the soft limit, Workers Paid ($5) only if `exceededCpu` ever appears. SEC-1c (native Strava interstitial) and STLS-F5 (refresh rotation) are open follow-ups in `docs/tasks/v5-security.md`; A9 (sign-up policy) awaits the owner.
4. **EM** batch 14 is running (ids above); apply its P-items to the playbook, mark incidents fixed-where, commit; EM batch 15 after the v6 teams land.
5. Later: LEGAL-Q, polish nits, Apple Health, `eas update:configure`, G-F1 (Garmin UTC-day gap via `time/localDate`), P-S2's `tools/list` 22.

## Where we are (2026-10-27 10:05)
**Production is live and current.** tanren.me (web), api.tanren.me (REST + Better Auth magic link),
mcp.tanren.me (MCP). Production = commit `25a0b64`, deployed 13:52 (DEPLOY-9: stateless auth ADR-0022 + migration 0006, legal pages, account-delete endpoint, Garmin schemas) from a clean worktree
whose root gate was green (159 files, 2002 tests); D1 at migration 0005 (applied by DEPLOY-5); the `*/5`
Strava-drain cron is registered (account subdomain `tanren-me`, `workers_dev` off). Live features: Plan week
"Logged N sets · volume" line (PLAN-LOG), W1 wordmark + the T mark as app/PWA icons (plan Amendment 15), OG
image + metas, polish round 5, Forge design, designed magic-link email,
sign-in gate (ADR-0019) with the signed-out **landing page** on web (ADR-0021, five generated
illustrations), Feed tab + activity detail + `/progress` (ADR-0017), guided programs with rep-count items
(ADR-0020: 15 of 24 Core 30 moves count reps), **Finish workout** on Today (inline after the set list on
phones since FIN-LAYOUT) plus auto-finish of stale sessions after a complete pull, Settings → Integrations
with Strava in **console mode** (ADR-0018; real export waits for the owner's Strava app keys), final 力
app icon / favicon / PWA icons + traced SVG mark, desktop polish round 4, brandbook artifact v3.

## Verified today (evidence in docs/tasks/step-2.md Log)
- Root `pnpm check` green at every deploy; DEPLOY-4 worktree run 156 files / 1948 tests (09:49).
- Live chunk check 09:55 (DEPLOY-4): root `_layout-d3f87cf8….js` carries the landing (`assets/landing` ×5,
  all five webps HTTP 200, "Sign in with a magic link"); `today-2b4c0ecf….js` carries "Finish workout" and
  the FIN-LAYOUT footer margin; `plan-570b4dd8….js` carries "Up next"; `__common-….js` carries the r4
  ListRow props and `finishStaleSessions`; `/health` → `{"ok":true}`. Route chunk names are listed inside
  the `entry-*.js` script that index.html names (not `index-*.js`); two `_layout-*` chunks exist and the
  landing is in the larger one.
- Designer verdicts: mobile-A r3 PASS, mobile-B r2 PASS, landing LAND-R PASS, desktop r4 PASS (all seven
  screens 4 at 1280/900). Code reviews: REV-PL (PROG-1/2, LOGO-2, FEED-7), PROG-R (PROG-3), REV-TF (Finish
  workout), REV-3 (Strava), REV-AF r2 (auto-finish), REV-POLISH (mobile pairs) all APPROVE; fixes landed,
  REV-POLISH should-fixes queued into polish round 5.
- Gallery https://claude.ai/artifact/YD5RTPNpuPy9hmpQLhJADQ v11 (14 sections, `desktop-r4` K1–K62; source tracked at
  `docs/design/screens/tanren-screens.html`; `node docs/design/gallery.mjs --publish` prints the files map).
  Brandbook https://claude.ai/artifact/S6ngEL7NHXU1LaMECafJYa v3.

## Live at hand-off (2026-10-27 14:14; agent ids in the scratchpad `live-agents.txt` and the step-2 Log)
**Production = `bdf7da1` (DEPLOY-15 15:31: slim cron runtime; DEPLOY-14 15:25 `954feb0`: SEC-1b security items; DEPLOY-13 15:12 `8493118`: Garmin pull sized for the Free plan; DEPLOY-12 15:02 `87d056a`: Garmin import + migration 0007 + SEC-1a seal binding + '12-Week Lean Build' data; DEPLOY-11 14:33 `761004b`; DEPLOY-10 14:22 `4be4770`; DEPLOY-9 13:52 `25a0b64`):** stateless auth (ADR-0022, migration 0006, no KV),
legal pages, account deletion end to end (LEGAL-2a/2b), write-path user-row checks (STLS-F3/F4), Garmin shared schemas, the
Forge consent/login/error/MCP-root pages (OAUTH-UI). HEAD = production + gallery manifest. Owner reconnected the Claude
connector (O1 done 13:59); O2 (delete the old KV namespace) is still open and owner-only.
**Owner rules in force:** every ask to the owner is its own bold line; NEVER mention the Resend key rotation or the Garmin
personal-key regeneration again (owner 13:52: he does both himself); the owner wants to reload VS Code — tell him
"safe to reload" only at a checkpoint where no agent is live and everything is committed.

**Resume checklist (in order):**
1. **Garmin team-lead** (opus, charter `docs/tasks/v5-garmin/team-garmin.md`, GO 13:48, hard stop ≈ 15:39): W1 done 14:01
   (GM-2/3/5), W2 running (GM-4 ∥ GM-6a ∥ GM-6b ∥ REV-1), then W3 (GM-7, GM-6S capture, GM-R), GM-D, GM-Q1, GM-Q2 (TEST key
   only from `scratchpad/secrets/garmin.token` into a shell var). Commit point = ONE team commit after REV-1 + GM-R APPROVE
   — the TL lists every file; add `packages/db/src/repositories/AccountErasure{,.test}.ts` (LEGAL-2b's two Garmin-table
   lines, uncommitted on purpose). Then DEPLOY-10 with `MIGRATE=1` (migration 0007), verify `/integrations` lists garmin,
   then **GO for v6 N-F0** (nutrition foundation; brief in `docs/tasks/v6-nutrition.md` §N-F0 — it edits the sync files
   the Garmin team owns, so never before that commit).
2. **OAUTH-UI** (fable engineer, dispatched 13:59, 20 min): Forge restyle of the consent / unknown-app / error pages
   (`apps/worker/src/oauth/pages.ts`) and `mcp.tanren.me/` (`McpLanding.ts`), self-hosted fonts or system stack, legal
   footer, shots `UI-OAUTH-*` (badges OA). On report: fable designer verdict → reviewed commit → worker-only deploy
   (`scratchpad/deploy.sh`, no migration) → gallery section `oauth` + `legal2` (AD1–AD5 rows exist in
   `docs/design/screens/UI-LEGAL2-rows.html`) → publish v14 (same URL; `node docs/design/gallery.mjs` for the map,
   `--write` for the manifest).
3. **Security review** (two fable reviewers, dispatched 14:08, 20 min): A = auth/OAuth/MCP, B = REST/sync/integrations/
   deletion/mobile. Route Critical/High findings to engineers at once (security briefs: pin the properties, see the
   playbook rulings paragraph); tell the owner the verdict in plain words.
4. **v6 nutrition** (ADR-0025, `docs/design/nutrition.md`, `docs/tasks/v6-nutrition.md` + `v6-nutrition/team-*.md`):
   company mode N-F0 → nutri-server ∥ nutri-today ∥ nutri-food → INT-N → INT-R ∥ N-QA; ports 9031–9033; migration 0008.
5. **EM** after each accepted batch (batch 11 due after OAUTH-UI + security + Garmin W2).
6. Later: LEGAL-Q (legal e2e after the Garmin deploy), the queued polish nits (`docs/tasks/v4-polish-briefs.md`), Apple
   Health (native build), `eas update:configure`, STLS-F2 (single-use consent handle) if wanted.

## Where we are (2026-10-27 10:05)
**Production is live and current.** tanren.me (web), api.tanren.me (REST + Better Auth magic link),
mcp.tanren.me (MCP). Production = commit `25a0b64`, deployed 13:52 (DEPLOY-9: stateless auth ADR-0022 + migration 0006, legal pages, account-delete endpoint, Garmin schemas) from a clean worktree
whose root gate was green (159 files, 2002 tests); D1 at migration 0005 (applied by DEPLOY-5); the `*/5`
Strava-drain cron is registered (account subdomain `tanren-me`, `workers_dev` off). Live features: Plan week
"Logged N sets · volume" line (PLAN-LOG), W1 wordmark + the T mark as app/PWA icons (plan Amendment 15), OG
image + metas, polish round 5, Forge design, designed magic-link email,
sign-in gate (ADR-0019) with the signed-out **landing page** on web (ADR-0021, five generated
illustrations), Feed tab + activity detail + `/progress` (ADR-0017), guided programs with rep-count items
(ADR-0020: 15 of 24 Core 30 moves count reps), **Finish workout** on Today (inline after the set list on
phones since FIN-LAYOUT) plus auto-finish of stale sessions after a complete pull, Settings → Integrations
with Strava in **console mode** (ADR-0018; real export waits for the owner's Strava app keys), final 力
app icon / favicon / PWA icons + traced SVG mark, desktop polish round 4, brandbook artifact v3.

## Verified today (evidence in docs/tasks/step-2.md Log)
- Root `pnpm check` green at every deploy; DEPLOY-4 worktree run 156 files / 1948 tests (09:49).
- Live chunk check 09:55 (DEPLOY-4): root `_layout-d3f87cf8….js` carries the landing (`assets/landing` ×5,
  all five webps HTTP 200, "Sign in with a magic link"); `today-2b4c0ecf….js` carries "Finish workout" and
  the FIN-LAYOUT footer margin; `plan-570b4dd8….js` carries "Up next"; `__common-….js` carries the r4
  ListRow props and `finishStaleSessions`; `/health` → `{"ok":true}`. Route chunk names are listed inside
  the `entry-*.js` script that index.html names (not `index-*.js`); two `_layout-*` chunks exist and the
  landing is in the larger one.
- Designer verdicts: mobile-A r3 PASS, mobile-B r2 PASS, landing LAND-R PASS, desktop r4 PASS (all seven
  screens 4 at 1280/900). Code reviews: REV-PL (PROG-1/2, LOGO-2, FEED-7), PROG-R (PROG-3), REV-TF (Finish
  workout), REV-3 (Strava), REV-AF r2 (auto-finish), REV-POLISH (mobile pairs) all APPROVE; fixes landed,
  REV-POLISH should-fixes queued into polish round 5.
- Gallery https://claude.ai/artifact/YD5RTPNpuPy9hmpQLhJADQ v11 (14 sections, `desktop-r4` K1–K62; source tracked at
  `docs/design/screens/tanren-screens.html`; `node docs/design/gallery.mjs --publish` prints the files map).
  Brandbook https://claude.ai/artifact/S6ngEL7NHXU1LaMECafJYa v3.

## Live at hand-off (2026-10-27 14:50, written for a context compaction; agent ids in the scratchpad `live-agents.txt`)
**Resume checklist (in order):**
1. **STLS team-lead** (opus, charter `docs/tasks/v5-auth/team-stateless.md`, sheet `docs/tasks/v5-auth.md`, hard stop ≈ 14:37
   on its clock): W1 + W2 landed and reviewed (root gate was green at 2186 at W2); W3 = STLS-4b (OAuth cut-over: KV +
   library removal, `McpAuth.layerJwt`, router) in flight, then STLS-6 docs, STLS-R, fix round, STLS-Q. On its W3
   interim / final: ONE build-clean commit of its full file list (it names every file; tree must build), then
   DEPLOY-9 (`scratchpad/deploy.sh`, no migration needed beyond 0006 → run with `MIGRATE=1` since 0006 is new),
   verify `/.well-known/oauth-authorization-server`, `/mcp` 401, `/api/token/refresh` 401 shape, no `OAUTH_KV` in
   `wrangler.jsonc`; then **owner O1: reconnect the Claude app once** (grants in KV are gone); O2 delete the KV
   namespace later. Ratified rulings are in the sheet (revoke 204, PKCE S256, refresh-after-revoke 400, pending-revoke
   retry marker or follow-up STLS-F1).
2. **Garmin**: GM-1 landed and green (shared schemas; sync members deferred to GM-2; the two literal holes in
   `integrationsCopy.ts` / `ExportQueue.ts` were filled under a Lead grant). GM-1's files are uncommitted: commit them with
   or right after the STLS commit (`packages/shared/src/index.ts` carries both teams' export lines; GM-1's new files
   `packages/shared/src/garmin.ts` + test must go in the same commit). The team charter is pre-written:
   `docs/tasks/v5-garmin/team-garmin.md` — dispatch a `team-lead` (opus) with it the moment the STLS commit is in HEAD.
3. **Legal**: LEGAL-1 committed WIP `c22590d` (pages, gate exception, links; box proofs in the Log). Running: LEGAL-R r1
   (reviewer/opus) and the LEGAL-D capture (engineer/sonnet → `UI-LEGAL-*` shots + `UI-LEGAL-rows.html`, badges G1–G9) →
   then a fable designer verdict on the shots (open question: hide the AppBar nav on signed-out legal pages at 1280?) →
   reviewed commit → gallery section `legal` → web deploy → LEGAL-Q. LEGAL-2 (account deletion, opus, brief in
   `docs/tasks/v5-legal-briefs.md`) after the STLS commit. LEGAL-3 done (Email Routing live), LEGAL-4 committed `a7d9e81`.
4. EM batch 8 is due (≥ 10 commits since batch 7): incidents to include — the Lead's IDENT-1 "host or subdomain"
   ruling (REV-ID caught), the spike leaving a dev server running, the partial token print, WD-1 brief asking for
   dry-run output, zsh word-splitting.
5. Owner-facing asks go in **bold** on their own line (memory `owner-asks-in-bold`).
- DEPLOY-5 DONE 10:55 (`MIGRATE=1 scratchpad/deploy.sh`): migration 0005 applied to production D1 (✅ in the log),
  Worker version 74509783 with `schedule: */5 * * * *` registered (no 10063), web version db23adb9; verified
  `/health` ok, `og.png` 200 + og metas in index.html, `icon-192.png` = the repo's T icon (3335 B).
- Play re-shoot done (shooter, 1 min): `UI-P5-play-*` re-captured at `7678246`; disc = outlined 56 px at 1280
  light, empty ring gone. Nit for the next polish round: at 1280 the eyebrow keeps its 28 px slot at progress 0
  (eyebrow x 148 vs title x 120); at 390 both are flush.
- Gallery v12 (sections `polish-r5` Q1–Q45 and `logo-4` T1–T7) published from the repo source
  `docs/design/screens/tanren-screens.html` (`gallery.mjs` now defaults to it, GAL-3). Brandbook artifact v5
  carries the W1 wordmark + T mark Logo group (BRAND-3; publish recipe: read the artifact, then `root`
  `docs/design/brandbook`, `file_path` = the index, other `project/*` files in `files`).
- PLAN-LOG done and reviewed (`e71da43` → `4426117`: Schema-decoded aggregate rows, `LoggedTotals` from the
  struct, fixture literal; REV-PL2 APPROVE) and live via DEPLOY-6 11:12 (Worker 2f896c11, web 6a38a0dc; "Logged"
  present in the live `__common` chunk). Plan dark captures go to the next polish round.
- MCP-ROOT done and live (DEPLOY-7 12:37, Worker 16e16920, web 54b5d055 after one transient 10013 retry):
  `https://mcp.tanren.me/` 200 help page (nosniff + CSP) naming the connector URL, root-form
  protected-resource metadata byte-identical to the `/mcp` form, `/mcp` still 401, api root still 404.
- IDENT-1 done and live (DEPLOY-8 12:55, Worker d5362f72): published client identities accepted
  (`clientIdMetadataDocumentEnabled` + `global_fetch_strictly_public`); `oauth/knownClients.ts` marks a client Known
  only when the document host is exactly claude.ai / claude.com / chatgpt.com, the path starts with `/oauth/` and the
  redirect returns to that host (loopback only for the Claude Code document) — REV-ID's round-1 blocker was the Lead's
  "host or subdomain" ruling (incident logged); consent shows "Verified app · <domain>. Only continue if you just
  started this in <Name>." or the "Unknown app" block + "Allow anyway". Live checks: AS metadata advertises
  `client_id_metadata_document_supported: true` + `none`; `/authorize` with the Claude Code identity → 200. EAS-1's
  production `NATIVE_RETURN_PREFIXES` is live too. OPEN: the claude.ai app's document URL is unconfirmed — if the
  owner's consent screen shows Unknown with "document hosted on claude.ai", widen the `/oauth/` prefix (one-line change
  in knownClients.ts + test) and redeploy.
- **Garmin + legal planning wave** (plan Amendments 18 + 19, dispatched 13:40): spike G1 probes Garmin's Personal API
  with the owner's TEST token (stored only at `scratchpad/secrets/garmin.token`, mode 600, never committed; the owner
  regenerates it after testing) → `docs/research/2026-10-27-garmin-personal-api.md`; architect Garmin → ADR-0023 +
  `docs/design/garmin.md` + `docs/tasks/v5-garmin.md` (Settings paste-token row, sealed token, cron pull into synced
  `imported_activity` / `daily_health`, feed cards; migration **0007** after STLS's 0006 is committed); architect legal →
  ADR-0024 + `docs/design/legal.md` (draft Privacy Policy + Terms with `[OWNER]` markers, `/privacy` + `/terms` public
  pages, landing/sign-in/About/consent links, `hello@tanren.me` via Cloudflare Email Routing) + `docs/tasks/v5-legal.md`.
  Status 14:45: both architects done (ADR-0023 + `docs/tasks/v5-garmin.md` GM-1…GM-7/R/D/Q; ADR-0024 +
  `docs/tasks/v5-legal.md` + `v5-legal-briefs.md`). Running: GM-1 (shared schemas, sonnet), LEGAL-1 (pages + gate
  exception + links, sonnet, port 8991). Done: LEGAL-4 (`a7d9e81`: email legal footer, robots.txt, security.txt),
  LEGAL-3 (Email Routing). Next: after the STLS commit → Garmin team (GM-2…GM-7, team-lead) and LEGAL-2 (account
  deletion, opus); LEGAL-R r1 + LEGAL-D after LEGAL-1; web deploy with the pages; LEGAL-Q.
- **Auth v2 wave** (plan Amendments 16 + 17, dispatched 12:45): spike S1 → `docs/research/mcp-client-identities.md`
  (CIMD in workers-oauth-provider 1.2.3, the Claude/ChatGPT client ids, trust model), spike S2 →
  `docs/research/stateless-sessions.md` (Better Auth stateless options with a symmetric secret; what the OAuth
  library keeps in KV), architect (fable, 20 min) → ADR-0022 + `docs/design/auth-v2.md` + `docs/tasks/v5-auth.md`
  with IDENT-1 (enable CIMD + allowlist + untrusted warning on the current library) first if it can ship today.
  Lead's concern on record: stateless tokens cannot be revoked before expiry → short TTLs + a per-user token
  generation in D1; `BETTER_AUTH_SECRET` already exists (reuse over a new `SECRET_KEY` unless the architect objects).
- EM batch 7 done (`fe602ef`): engineer rule 9 (scratch D1 proofs, `db:reset`, no `--dry-run`), team-lead
  capture-stack ownership, ui-check per-task stack; playbook P1–P4 + P6 applied. P5 is the owner's (item 9 below).
- Done this morning (all committed): FIN-LAYOUT `e34ca1e` + DEPLOY-4; EM batch 6 (`4e74a28`); SF-1 Strava
  follow-ups reviewed (`be3261a` → `4ccea78`: refresh lease, planned-session names, optional `?limit`); polish
  round 5 PASS (`4447765`) + Player light fixes (`7678246`); LOGO-4 W1 wordmark + T mark (`499b1a9`, plan
  Amendment 15) + BRAND-2b OG image (`6633431`); WD-1 workers_dev off (`8215fb9`); workers.dev subdomain
  `tanren-me` created via the Cloudflare MCP. Auto-finish known limit: an offline device that never completes
  a pull never auto-closes.
## Experiment for the next step (retro 2026-10-26-v4-evening)
Wave dispatch + background deploy. Metrics that decide it: zero Lead acceptance edges > 5 min; team-lead
streams ≥ 1.3 children-active ÷ wall; polish r5 PASS ≤ 45 min wall (r5 dispatched 10:00 with three parallel
children: measure it). Lockstep spike answered: the 22:32–22:51 gaps were the Mac idle-sleeping on battery
(`docs/research/process-lockstep-gaps.md`; `caffeinate -i` at session start is playbook step 0; keep the Mac
on AC). Retro verdict: throughput high (9 streams,
3 deploys, 64 acceptances in 3 h), process quality medium (≈ 30 min lost to Lead stalls + lockstep gaps).

## Owner-gated (exact steps)
1. **Strava** — PARKED by the owner 2026-10-27 11:20 ("skip for now, I will create later"); production stays
   in console mode, nothing to do until keys appear. When they do (O1–O3 in `docs/design/deploy.md`): API app at strava.com/settings/api
   with callback domain `api.tanren.me`; paste `STRAVA_CLIENT_ID` + `STRAVA_CLIENT_SECRET` → the Lead runs
   `pnpm exec wrangler secret put STRAVA_CLIENT_SECRET --env production` from `apps/worker`, sets the id and
   `STRAVA_MODE: "provider"` in `wrangler.jsonc` `env.production.vars`, redeploys, then SV-Q2 (first real
   export: `start_date_local`, Weight Training, "View on Strava").
2. **Cron trigger**: done on the Lead's side 2026-10-27 (subdomain `tanren-me` created via the MCP; DEPLOY-5
   registers the `*/5` cron). Owner: nothing, unless DEPLOY-5's log still shows 10063.
3. **Wordmark**: picked (W1; the T from W1 is the mark, plan Amendment 15) and shipped (LOGO-4, BRAND-2b).
   Owner: look at gallery section `logo-4` (T1–T7: sheet, drift comparison, sign-in and landing) and say if
   the T reads well as the app icon; the brandbook artifact still shows 力 until BRAND-3.
4. **Claude connector**: add **`https://mcp.tanren.me/mcp`** (the `/mcp` path, not the bare origin — the
   origin answered 404 on 2026-10-27; MCP-ROOT gives it a help page) as a custom connector in the Claude app,
   then sign in via the magic link in the OAuth window. Checks: `/.well-known/oauth-authorization-server` 200,
   `/mcp` 401 with `www-authenticate` naming the protected-resource metadata.
5. **EAS**: done 2026-10-27 13:05 — the owner ran `pnpm dlx eas-cli@latest login` + `init` in `apps/mobile`; project id
   `71f6f700-4c89-4627-8a93-b2fdd82974a5`, owner `tanren` (app.json). EAS-1 puts it into
   `env.production.vars.NATIVE_RETURN_PREFIXES` (rides DEPLOY-8). Left: `eas update:configure` + the first EAS Update
   channel when the iPhone path starts (Expo Go 58 on the phone when the store has it).
6. **Resend**: key rotated by the owner 2026-10-27 11:20. The production Worker still holds the OLD key as the
   `RESEND_API_KEY` secret unless it was updated too → magic-link emails fail until
   `cd apps/worker && pnpm exec wrangler secret put RESEND_API_KEY --env production` (paste the new key at the
   prompt, never in chat) — owner or Lead with the owner present; then request a magic link on tanren.me once
   and confirm the email arrives.
7. **Restart Claude Code** only when the Lead says the streams are quiet (hooks snapshot at startup; the
   owner-registered `em-cadence.sh` becomes active then).
8. Later: Apple Health needs the native dev build (Apple Developer account).
8a. **Contact mailbox** — done 2026-10-27 14:08 by the Lead via the Cloudflare API: Email Routing enabled on tanren.me
   (MX route1–3.mx.cloudflare.net added; no prior MX/SPF on the apex), destination `lukasmikuckis@gmail.com`
   (verified at creation), rule `hello@tanren.me → forward` (id 281deedbf37341608e95c2c4b6091328). Legal texts and the
   landing footer use `hello@tanren.me`; the operator is named "Tanren" with no postal address (owner, 13:45).
9. **Permissions** — decided by the owner 2026-10-27 11:20 (`.claude/settings.json`): `Bash(wrangler:*)`,
   `Bash(pnpm:*)` and `Bash(git commit:*)` are allowed outright; `ask` holds only `rm -r*` variants; `deny` only
   the env files; `git push|reset|checkout`, `eas *` and the Cloudflare MCP `execute` are unlisted (auto-mode
   classifier). Consequence: nothing stops a subagent from deploying except the role files and briefs — keep the
   "Forbidden" line in every brief and charter, and keep deploys Lead-run from clean worktrees.

## Next actions (in order)
1. Finish MCP-ROOT (commit, DEPLOY-7, live check), then the auth v2 wave: read ADR-0022 + `docs/tasks/v5-auth.md`,
   dispatch IDENT-1 first (owner wants to connect the Claude app), then the stateless tasks in the sheet's order;
   owner step when the design lands: `wrangler secret put` for a new secret only if ADR-0022 asks for one.
2. EM batch 8 after the next ≥ 4 commits.
3. Next polish round (nits in `docs/tasks/v4-polish-briefs.md` §Queued: eyebrow 28 px slot at 1280, landing
   light-scheme colour set, eyebrow repeats the name; dark captures for the Plan logged line) — or the next
   feature the owner names; the v4 backlog is otherwise empty.
3. Strava go-live when keys arrive (owner step 1 below) + SV-Q2.
3a. Parked, owner-asked 2026-10-27 13:15: **Garmin**. Garmin reopened its Connect Developer Program on 2026-10-21 with a
   free **Personal** tier: instant key + access tokens from https://connect.garmin.com/app/settings/personalApiToken,
   own data only, pull-only Activity (JSON + .FIT), Health and Women's Health JSON; Training/Courses (push a workout to
   the watch) are business tiers only (Starter: free, apply via form, push-only, limited users). Fit for Tanren: the
   Worker pulls the owner's activities + daily health on the existing `*/5` cron with the personal token as a Worker
   secret → feed cards for runs/calories (ADR + spike on token lifetime, rate limits, history depth, which the public
   pages do not state). Alternatives noted: Apple Health bridge (native build), Strava bridge (parked keys); MyFitnessPal
   has no public API. Sources: developer.garmin.com/gc-developer-program/overview/, dcrainmaker 2026-10 revamp article.
4. Design notes parked: landing light-scheme illustration amber vs rust primary (one colour set, D1),
   eyebrow repeats the name; landing `contentH` probe is the measure (`docH` = viewport on `Page scroll`).
5. Process: forward role-file deltas to any team-lead spawned before the last EM batch in the same turn the
   EM report is accepted (r5 received batch 6's deltas after its children were briefed); charters now tell
   team-leads to re-read role files by mtime before each round.

## Deploy recipe (Lead-run; owner lifted the ban 2026-10-26, dev-system §13)
`scratchpad/deploy.sh` (recreate from this if purged): `git worktree remove --force $S/deploy-wt; git worktree
add --detach $S/deploy-wt HEAD` → `pnpm install --frozen-lockfile` → `pnpm check` (stop if red) →
`EXPO_PUBLIC_API_URL=https://api.tanren.me CI=1 pnpm -F @tanren/mobile export:web` → in `apps/worker`:
`pnpm exec wrangler deploy --env production` (cron step fails with 10063 until item 2 above; the script
still deploys) and `pnpm exec wrangler deploy -c wrangler.web.jsonc --env production` → `curl --resolve
api.tanren.me:443:104.21.69.164 https://api.tanren.me/health` and the same for tanren.me (Mac resolver
caches NXDOMAIN). Verify features on the live route chunks (`_layout-*.js`, `today-*.js`), not the entry.
Account `326ec3d6fda1261c15bf6580fd81e426`, zone `50927fc2e0c893c52ce33e169700eef3`, D1
`0cdfa785-fd69-4971-adf8-14a4acb89a01`, KV `f7ea7f892333457f991ae37413b89d97`; secrets uploaded:
`BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `INTEGRATION_TOKEN_KEY`.

## Gotchas that cost time today (all in docs/retro/incidents.md; rules applied by EM batches 1–5)
- Never commit a file two live streams edit unless both pieces are in the tree; deploy only from a clean
  worktree (settings.tsx blocked a deploy for an hour).
- Team-lead children run concurrently only when dispatched in ONE Agent message (retro correction of EM
  batch 3's "sequential by construction"); charters say so and give each child a disjoint file set.
- Capture `Commit:` is stamped at export; `get-session` must be non-null before a capture batch; pid files
  guarded (`kill 0` killed an engineer's own stack); charter ports probed with `ps -ef | grep "port <n>"`.
- A design predicate names its writer (ADR-0018's `finishedAt` had none → Today never exported).
- Image prompts carry a colour pin per motif; size proofs use `du -ch <glob> | tail -1`.
- Gallery: never publish as a new artifact (60 v1 shots exist only in the artifact store); badges unique
  (`gallery.mjs` checks).
