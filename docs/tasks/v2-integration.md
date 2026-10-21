# INT-X — v2 integration (design ∥ catalog ∥ programs ∥ illustrations ∥ native-auth)
Source: docs/tasks/v2-*.md finals · Status: pre-written (dispatch when all five streams are committed) · Updated: 2026-10-21 · Roles: engineer/opus (INT-X1 full stack), engineer/sonnet (INT-X2 phone + MCP), reviewer/opus (cross-team) · Boxes: 20 / 15 / 15 min

Never run a command under permissions.ask: `git push|reset|checkout`, `rm -r*`, `wrangler deploy|login|secret|d1 execute`, `eas *`, Cloudflare MCP `execute`; `pnpm db:reset` is fine.

## Goal
One committed tree the owner can test in the morning from two recipes (`docs/design/local-dev.md` §Owner recipe for web, §6a for the phone), with every v2 feature reachable: Library with illustrations → add an exercise to today → Programs → start Core 30 day 1 → timer/rest → complete → Progress shows it → Settings theme/export/sign-out → PWA install → Claude Code `search_exercises`/`get_overview` through OAuth or the dev token. Root `pnpm check` green.

## Read first
- `docs/design/local-dev.md` (§Owner recipe, §6a), `docs/tasks/v2-{design,catalog,programs,illustrations,native-auth,extras}.md` Logs and Integration checklists, `docs/tasks/step-5/team-mcp-oauth.md` §Integration checklist, `.claude/skills/ui-check/SKILL.md`
- Every path claim below is grep-verified by the engineer before use (teams moved files during the night).

## INT-X1 (engineer / opus, 20 min) — web full stack
In: root `package.json` scripts only if a recipe command is missing, `docs/design/local-dev.md` (§Owner recipe v2 additions), fixes to build/type/lint drift between teams (one-line imports, barrel lines, placeholder leftovers), `apps/mobile/CLAUDE.md` / `apps/worker/CLAUDE.md` Status lines. Out: new features; semantic conflicts go back to the Lead in ≤ 3 lines.
- [ ] Root `pnpm check` green after all five streams (paste the tail with the test count).
- [ ] `pnpm db:reset` → `pnpm web:export` → `pnpm dev` → recipe in `ui-check` on :8790 at 390 and 1280, light and dark, pasted as accessibility snapshots: sign in (`dev@tanren.local`, link from the terminal) → Today shows today's session with the design restyle and the "Core 30 · Day N" banner once enrolled → Library: search "squat", filter by muscle, open a detail with a real SVG, "Add to today" → Today lists it → Programs: enrol Core 30, start day 1, first exercise timer runs, rest phase shows the ring, skip to completion → a session with sets exists (Today/Progress) → Progress: exercise history chart, a PR badge after logging a heavier set → Settings: theme toggle persists on reload, export downloads a JSON that decodes with `DataExport`, sign-out returns to the signed-out Today with the "Sign in" link → sign in again → data still there.
- [ ] PWA: `manifest.json` served with `application/json`, `theme_color` #C2410C, install prompt available in Chromium (`ab eval` for `beforeinstallprompt` or the manifest fetch).
- [ ] Illustrations: validator output pasted (count = catalog size, 0 failures, max size ≤ 6 KB).
- [ ] `docs/design/local-dev.md` §Owner recipe extended with the v2 steps exactly as they worked.

## INT-X2 (engineer / sonnet, 15 min, in parallel; disjoint files) — phone + MCP
In: `docs/design/local-dev.md` §6a (corrections only), `docs/tasks/v2-integration.md` Log. Out: code.
- [ ] `PORT=8797 pnpm dev:phone` starts, prints the LAN URL; `curl` `/health` 200; a `POST /api/native/begin` with `returnTo` = `exp://<LAN IP>:8081/--/auth/callback` → 200 and a QR printed in the terminal (paste 3 rows); kill only your PIDs.
- [ ] `pnpm -F @tanren/mobile exec expo export --platform ios --output-dir <scratch>` bundles (tail pasted) — the native bundle builds with every v2 module.
- [ ] MCP via dev token on :8787 (`--mcp-config` + `--strict-mcp-config`, VS Code `claude` binary if `claude` is not on PATH): `search_exercises("squat")` returns catalog hits with `catalogId`; `get_overview` 7d still answers; `write_plan_week` is listed only when the grant has `tanren:write` (dev token = both scopes locally). Paste the tool outputs.
- [ ] OAuth metadata smoke: `GET /.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource/mcp` return the expected JSON (both scopes listed).

## Then (Lead)
- Cross-team `reviewer` (opus, 15 min) on `git diff 1884750 HEAD` scoped to the v2 paths: boundaries, hard rules, the `src/ui` barrel as the only UI import surface, `runtime.ts` layer wiring, catalog data sanity (no duplicate names, every `CORE30_CATALOG_IDS` present), illustration validator in the gate, no secrets logged.
- Commit "v2: …"; one EM Mode 1 batch over the four team finals; `/retro` v2 (from transcripts; targets: rolling review ≤ 3 min fix-round wait, team finals ≤ 50% of box, 0 harness nudges); handoff; **morning report** leading with the two recipes.

## Log
- 00:58 · pre-written by the Lead while the five streams run
- 09:30 · INT-X2 (sonnet, cut short at ~13 min by owner): `PORT=8797 pnpm dev:phone` OK (LAN 192.168.0.150, /health 200, begin pinned 200 `{sent:true}` + QR, unpinned 400 `return-to`); `expo export --platform ios` OK (hbc 6.9MB). OAuth AS metadata OK (scopes tanren:read+write). FOUND: (1) `/.well-known/oauth-protected-resource[/mcp]` is 404 on the worker (AS metadata only; PRM is not served by the worker), (2) on a non-default PORT the MCP dev token gets 401 "Token audience does not match resource server" because `MCP_RESOURCE_URL` stays `http://localhost:8787/mcp` (and AS metadata `protected_resources` lists it); `dev:phone` should pass `--var MCP_RESOURCE_URL:http://localhost:$P/mcp`. NOT RUN: search_exercises/get_overview/tool list live (blocked by 2). INCIDENT: my process-tree kill script was wrong and killed unrelated PIDs (see report); other engineers' dev servers may need a restart.
