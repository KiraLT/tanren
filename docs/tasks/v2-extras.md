# v2 — team extras: Progress (history), Settings, web install (PWA)
Source: docs/plan.md Amendment 4 ("think yourself what to do") · Status: planning · Updated: 2026-10-21
Design: `docs/design/v2-extras.md` (normative: verified facts §0, contracts §1–§4, cross-team requests §5).
Starts after design D1 (tokens, primitives, theme provider in `apps/mobile/src/ui/**`) for every UI task; X1, X2 start at once.

## Team charter: extras
Mission: Tanren feels complete for one user. A **Progress** tab shows per-exercise history (best set, Epley e1RM, 8-week volume bars, e1RM sparkline, PR badges) and a sessions list with totals, from the local store only. A **Settings** screen shows the signed-in email, signs out on web (rows kept, owner forgotten), sets the theme, states kg-only, exports all data as JSON on web, and shows the version. The exported web app is **installable** in Chrome (manifest, icons, theme colour). No worker change, no service worker.
Owned paths (exclusive): `packages/shared/src/dataExport.ts` + `dataExport.test.ts` + one append-only barrel line in `packages/shared/src/index.ts`; `apps/mobile/src/services/{progressMath,HistoryRepo,Account,DataExport}.ts` + their `*.test.ts`; `apps/mobile/src/hooks/{useHistory,useAccount,useExportData,useExportData.web}.ts`; `apps/mobile/src/components/progress/**`, `apps/mobile/src/components/settings/**`; `apps/mobile/app/(tabs)/progress.tsx`, `apps/mobile/app/progress/[exerciseId].tsx`, `apps/mobile/app/settings.tsx`; `apps/mobile/public/{manifest.json,index.html,icons/**}`; `apps/mobile/src/pwa/**`; `apps/mobile/CLAUDE.md` new section "## v2 extras" only; `.claude/skills/expo-mobile/SKILL.md` one new "PWA" paragraph.
Adjacent with owners (read-only for extras; needs go as one-line requests via the team-lead to the Lead):
- design: `apps/mobile/src/ui/**`, `app/_layout.tsx`, `app/(tabs)/_layout.tsx` (R1 tab line), `app.json`, existing `src/components/*.tsx` restyle.
- programs: its own tab and screens; touches nothing above.
- MOBILE-2: `src/services/{SyncEngine,StoreEvents}.ts`, `src/hooks/{useSync,useLogSet}.ts`, `src/services/runtime.ts` (R4 one line).
- R3 dependency owner (design D1 or illustrations foundation, the Lead names it): `apps/mobile/package.json`, `pnpm-workspace.yaml` catalog, `pnpm-lock.yaml`.
- AUTH-1: `apps/worker/src/auth/**` (no change needed, design §0). mcp-oauth: worker `src/{mcp,oauth}/**`, `index.ts`, `wrangler*.jsonc` (no change needed).
- Unowned, read-only: `src/services/{CurrentUser,LocalStore,SqlDriver*,TodayRepo,PlanWeekRepo}.ts`, `src/store/**`, `public/_headers`.
Contracts (frozen at X1/X2 merge): design §1.2 `HistoryRepo` shape and names, §1.1 `epley1Rm`/`SetScore`/`markPrs`, §2.1 `Account` + `forgetOwner`, §3 `DataExport`, §4 manifest fields and icon paths.
Provides: `DataExport` in `@tanren/shared` (future MCP/import may reuse); `HistoryRepo` (programs may read it later); `/progress`, `/progress/[exerciseId]`, `/settings` routes; installable web build.
Assumes (cross-team):
- Sign-out is `POST /api/auth/sign-out` on the existing Better Auth mount; no worker edit (design §0 rows 1–2, verified in installed better-auth 1.7.11).
- Local rows survive sign-out; re-sign-in of the same user re-keys `LOCAL_USER_ID` rows because the owner key is gone (design §2.2, from `SyncEngine.ts:294-304`, `seed.ts:69-76`).
- Holds are seconds in `reps`; Progress shows raw numbers, e1RM only meaningful for weighted sets (ADR-0007 Q4).
- History week buckets start Monday local time; plan weeks keep any weekday (design §1.1; ADR-0007 Q3 governs plan weeks only).
- kg only (ADR-0007).
- Uncited, needs the Lead before X3/X4/X5 dispatch: R1–R4 of design §5 are in the owners' sheets; D1's token names and theme API are read from `src/ui/**` after D1 lands (extras never guesses them).
Runtime proof (X3, X4, X5 and once before the team report): `ui-check` on the **exported** build at viewports 390×844 and 1280×800. Export to a scratch dir so other teams' `apps/mobile/dist` is untouched: `pnpm -F @tanren/mobile exec expo export --platform web --output-dir $SCRATCH/extras-dist` (VERIFY flag) → `pnpm -F @tanren/worker exec wrangler dev -c wrangler.web.jsonc --assets $SCRATCH/extras-dist --port 8798` (VERIFY `--assets` overrides the config; else ask the Lead for the `dist` slot). Signed-out/offline demo mode is enough for Progress, export and PWA (log 3 sets on Today first, one heavier → PR badge). Sign-out needs a credentialed origin (`:8790` web + `:8787` API, design §0 row 3): run it only when the Lead grants that slot, else it moves to INT-X. Open `/today`, then a direct full load of `/progress` and `/settings` (bfcache rule, expo-mobile skill). Kill only PIDs you started (`pkill -P <pid>`).
Docs: X6 writes `apps/mobile/CLAUDE.md` "## v2 extras" + the skill's PWA paragraph; design corrections go through the team-lead with one Log line.
Budget: ≤ 2 engineers in parallel · 1 reviewer for the team · ≤ 2 review rounds · models: opus only for X2; sonnet for everything else · Time box = chain-sum + 15 = (X2 20 + X3 20 + X4-tail 3 + X6 8 + REV 12) + 15 = **78 min**.
Forbidden: never run a command under permissions.ask: `git push|reset|checkout`, `rm -r*`, `wrangler deploy|login|secret|d1 execute`, `eas *`, Cloudflare MCP `execute`; `pnpm db:reset` is fine. Also: no chart library, no service worker, no worker/`wrangler*.jsonc` edits, no `app.json` edit, no edits to adjacent paths (requests only), no commits.
Report: team report format from `.claude/agents/team-lead.md`.

## Decisions (all accepted (Lead delegation), 2026-10-21)
- E1 Progress reads the local store only via a new `HistoryRepo` (no endpoint, no `userId` filter, live rows only); PR = strictly beats the best earlier set by (e1RM, reps, weight); first-ever set is not a PR.
- E2 Charts: hand-rolled SVG on `react-native-svg` 15.16.0 with pure, tested geometry; no chart library (design §1.3).
- E3 Settings is a root-Stack route reached from a gear in the Progress header, not a fifth tab (tab bar stays ≤ 5 with programs).
- E4 Sign-out (web): server first, then forget `ownerUserId`, then full reload; local rows kept; offline sign-out refused with copy. Different-user-on-device stays out of scope (follow-up ADR).
- E5 Export = `DataExport` envelope over `SyncChange` (shared), JSON download on web only.
- E6 PWA: hand-written `public/manifest.json` + `public/index.html` template + committed PNG icons rendered once from one SVG; no `app.json` change, no `_headers` change, no service worker (offline shell needs Workbox, not one flag).

## Tasks
| id | title | role / model | depends on | files | status |
| --- | --- | --- | --- | --- | --- |
| X1 | Shared `DataExport` schema + round-trip test + barrel line | engineer / sonnet | — | `packages/shared/src/{dataExport,dataExport.test}.ts`, `index.ts` (1 line) | todo |
| X2 | `progressMath` + `HistoryRepo` + node:sqlite tests | engineer / opus | — | `apps/mobile/src/services/{progressMath,HistoryRepo}{,.test}.ts` | todo |
| X3 | Progress UI: `useHistory`, chart geometry + `WeekBars`/`Sparkline`, list + detail routes | engineer / sonnet | X2, D1, R1, R3, R4 | `src/hooks/useHistory.ts`, `src/components/progress/**`, `app/(tabs)/progress.tsx`, `app/progress/[exerciseId].tsx` | todo |
| X4 | Settings: `Account`, `DataExport` service, hooks, `settings.tsx`; tail: gear link in `progress.tsx` | engineer / sonnet | X1, D1 (R2), R4; tail after X3 | `src/services/{Account,DataExport}{,.test}.ts`, `src/hooks/{useAccount,useExportData,useExportData.web}.ts`, `src/components/settings/**`, `app/settings.tsx`, `app/(tabs)/progress.tsx` (tail, 1 element) | todo |
| X5 | PWA: manifest, icons, `index.html` template, token test, install proof | engineer / sonnet | D1 (token values) | `apps/mobile/public/{manifest.json,index.html,icons/**}`, `apps/mobile/src/pwa/**` | todo |
| X6 | Docs: mobile CLAUDE.md section + expo-mobile PWA paragraph | engineer / sonnet | X3, X4, X5 | `apps/mobile/CLAUDE.md` (own section), `.claude/skills/expo-mobile/SKILL.md` (1 paragraph) | todo |
| X-REV | Review on `git diff <baseline> -- <owned paths>` + `pnpm -F @tanren/shared check`, `pnpm -F @tanren/mobile check` | reviewer / opus | X3, X4, X5 | owned paths | todo |

Parallel groups (≤ 2 engineers): A = {X2, X1→X5} · B = {X3, X4} · C = {X4 tail, X6} · D = {X-REV, fixes}.

## Done-criteria
### X1 (time box 8 min)
- [ ] `DataExport` exactly as design §3 (field schemas `Timestamp`, `UserId`, `SyncChange` imported, not retyped); test decodes the §3 example extended to one row per table, rejects `version: 2`, encodes back to identical JSON.
- [ ] `pnpm -F @tanren/shared check` green, output pasted. Never run a command under permissions.ask: `git push|reset|checkout`, `rm -r*`, `wrangler deploy|login|secret|d1 execute`, `eas *`, Cloudflare MCP `execute`; `pnpm db:reset` is fine.
### X2 (time box 20 min)
- [ ] `progressMath.ts` per §1.1: `epley1Rm(100,5)=116.67`, `(100,1)=100`, `(0,12)=0`, `(80,0)=0`; `SetScore` ranks bodyweight by reps; `markPrs` first set false, equal-best false, strict beat true.
- [ ] `HistoryRepo` per §1.2 with `layer` over `LocalStore`, ≤ 3 SELECTs per method, tombstoned sets **and** sets of tombstoned sessions excluded; `weeks` exactly 8 zero-filled (TestClock + `DateTime.layerCurrentZoneNamed("Europe/Vilnius")` (name verified in installed effect), one test across the 2026-10-25 DST change); `sessions` title fallback "Workout", `durationMinutes` None when unfinished, `prs` stable.
- [ ] ≥ 12 tests on node:sqlite (`SqlDriver.testing.ts`, as `PlanWeekRepo.test.ts`); `pnpm -F @tanren/mobile check` green, pasted. Never run a command under permissions.ask: `git push|reset|checkout`, `rm -r*`, `wrangler deploy|login|secret|d1 execute`, `eas *`, Cloudflare MCP `execute`; `pnpm db:reset` is fine.
### X3 (time box 20 min)
- [ ] `chartGeometry.ts` + test (8 bars, all-zero baseline, sparkline gaps); `WeekBars`/`Sparkline` with `accessibilityLabel`; colours/spacing only from D1 tokens; no Effect in components (`.claude/rules/react.md`).
- [ ] `progress.tsx` Exercises | Sessions; detail route; two-column aside at ≥ 900; empty state; run `expo start` once so typed routes know the new routes.
- [ ] Runtime proof per charter at 390 and 1280: after logging 3 sets, `snapshot` shows the exercise row with best set + e1RM, a `PR` badge, 8 bars; direct load of `/progress` works. Gate green, pasted. Never run a command under permissions.ask: `git push|reset|checkout`, `rm -r*`, `wrangler deploy|login|secret|d1 execute`, `eas *`, Cloudflare MCP `execute`; `pnpm db:reset` is fine.
### X4 (time box 20 min)
- [ ] `Account` per §2.1 with tests on a stub `HttpClient` + node:sqlite: sign-out success forgets the owner; 401/500/network → `SignOutFailed`, owner untouched; `AccountSessionBody` decodes `null` and `{user:{id,email}}`.
- [ ] `DataExport.exportAll` test: live rows only, all 8 tables, decodes with `DataExport`. Web hook downloads `tanren-export-YYYY-MM-DD.json`; native shows "Export on the web app"; native hides Sign out.
- [ ] `settings.tsx` rows per §2.3 (theme via D1 API, else read-only "Follows system"); tail: gear link to `/settings` in the Progress header.
- [ ] Runtime proof at 390 and 1280: `/settings` direct load, export downloads a file that parses; sign-out flow only with the Lead's `:8790/:8787` slot (else note "moved to INT-X"). Gate green, pasted. Never run a command under permissions.ask: `git push|reset|checkout`, `rm -r*`, `wrangler deploy|login|secret|d1 execute`, `eas *`, Cloudflare MCP `execute`; `pnpm db:reset` is fine.
### X5 (time box 15 min)
- [ ] Files per §4; `src/pwa/manifest.test.ts` parses `public/manifest.json`, asserts required fields, icon files exist, and `theme_color`/`background_color` equal the D1 token values.
- [ ] Exported build: `curl -sI :8798/manifest.json` → 200 `application/json` (V3); icons 200; `index.html` in the export has the manifest link + theme-color; `crossOriginIsolated` still true; installability via agent-browser CDP `Page.getInstallabilityErrors` → `[]` if exposed (V1), else say so and add "check the install icon in Chrome" to the owner actions.
- [ ] Gate green, pasted. Never run a command under permissions.ask: `git push|reset|checkout`, `rm -r*`, `wrangler deploy|login|secret|d1 execute`, `eas *`, Cloudflare MCP `execute`; `pnpm db:reset` is fine.
### X6 (time box 8 min)
- [ ] `apps/mobile/CLAUDE.md` "## v2 extras": routes, `HistoryRepo`/`Account`/`DataExport` one line each, sign-out policy, PWA files; layout block untouched (other teams own it). Skill: verified PWA facts (design §0 rows 4, V1–V4 results). Never run a command under permissions.ask: `git push|reset|checkout`, `rm -r*`, `wrangler deploy|login|secret|d1 execute`, `eas *`, Cloudflare MCP `execute`; `pnpm db:reset` is fine.
### X-REV (time box 12 min)
- [ ] Diff reviewed against design §1–§4 and the hard rules; package gates green; blocking findings routed within the team; nothing edited outside owned paths. Never run a command under permissions.ask (charter line).

## Integration (Lead)
- INT-X: root `pnpm check` green; on `:8787` + `:8790` (owner recipe, `docs/design/local-dev.md`): sign in by magic link → Settings shows the email → Sign out → reload is signed out with rows visible → log a set → sign in again → the set syncs (server `list_sessions` or `/sync/pull` shows it). Combined ui-check with design/programs tabs at 390 and 1280.

## Log
- 2026-10-21 · created from architect breakdown (`docs/design/v2-extras.md` the same hour)
