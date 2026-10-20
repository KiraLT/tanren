# v2 — team programs: foundation (shared/db/mobile store), Core 30, workout player, progress sync, Live Activity
Source: docs/plan.md Amendment 4 · Status: planning · Updated: 2026-10-21 · Baseline commit: the Lead's post-step-5 commit
Design: `docs/design/v2-programs.md` (normative) · depends on `docs/design/v2-catalog.md` §2/§4 and `docs/design/design-system.md` (design architect) · native facts: `docs/research/2026-10-21-live-activities-spike.md` (S-NATIVE-SPIKE).
Runs in company mode with teams **catalog** (`docs/tasks/v2-catalog.md`) and **illustrations** (`docs/tasks/v2-illustrations.md`). This team also runs the two **foundation** tasks V2-F1/V2-F2 before any team fans out.

## Team charter: programs
Mission: the owner opens the Program tab in Expo Go, enrols in Core 30, presses Start and is guided through 7 timed core exercises × 3 rounds with countdown, rest timer, haptics/sound cues, keep-awake and a rest-end local notification when the phone is locked; finishing writes a `session` + `set`s and a `programDayCompletion` that sync to D1 (LWW). The Live Activity ships as a dev-build-only adapter behind the same port (ADR-0012).
Owned paths (exclusive): `packages/shared/src/programs/**`, `packages/shared/src/program.ts` (+ test), `apps/mobile/src/services/{ProgramRepo,PhaseAlerts,PhaseAlerts.notifications}.ts` (+ tests), `apps/mobile/src/player/**`, `apps/mobile/src/hooks/usePlayer.ts`, `apps/mobile/src/player/components/**`, `app/(tabs)/programs.tsx`, `app/programs/**`, `apps/mobile/src/native/**`, `apps/mobile/assets/sounds/**`, `eas.json`, `app.json` plugins block, `apps/mobile/CLAUDE.md` §programs. Foundation (V2-F1/F2, this team, before fan-out): see v2-programs.md §6 list.
Adjacent with owners: `apps/mobile/src/services/runtime.ts` — MOBILE-2 owns `failureMessage`; programs inserts one `ProgramRepo.layerNoDeps` line in `AppLayer`, catalog inserts `ExerciseLink.layerNoDeps` (announced; integration resolves). `TodayReady.tsx` — one banner block only (announced). `useSync.ts`, `useLogSet.ts`, `SyncEngine.ts`, `StoreEvents.ts` — MOBILE-2, read-only. `src/services/ExerciseLink.ts` — team catalog (port, v2-catalog.md §4). `apps/mobile/src/ui/**`, `design-system.md` — design architect, read-only. `apps/worker/**`, `packages/db/src/repositories/**`, `packages/shared/src/mcp.ts` — mcp-oauth/AUTH-1, read-only.
Provides: migration `0002_v2.sql` + Drizzle schemas (incl. `exercise.catalog_id` for catalog); shared `EntityName`/`SyncTable`/`SyncChange`/`ROW_TABLE`/`ROW_KEYS` extended; mobile store v2; third tab stubs `library` + `program`; mobile deps installed; `PhaseAlerts` port; `Program`/`CORE30`.
Assumes (cross-team, cited):
- catalog: `CORE30_CATALOG_IDS` exist in `data/core.ts` with `kind: "timed"` (v2-catalog.md §3); `ExerciseLink.ensure(catalogId): Effect<ExerciseId, StoreError>` with `layerNoDeps` as v2-catalog.md §4 — needed by P5 only; until it reports, P5 compiles against a local fake in its test and the team-lead waits for the Lead's "C3 reported".
- F1 taxonomy (`Slug`, `CatalogId`) in `packages/shared/src/catalog/taxonomy.ts` (v2-catalog.md §2) — written by this team's V2-F1, consumed by catalog.
- design: tokens and primitives under `apps/mobile/src/ui/**` exist when P4 starts (design-system.md); `ExerciseIllustration` component is team catalog's (v2-catalog.md §5) — P4 renders a placeholder until the Lead says it landed.
- MOBILE-2: `SyncEngine` iterates `SYNC_TABLE_ORDER` generically (v2-programs.md §2 VERIFY); a needed edit is escalated, not made.
- Lead/owner: Apple account, `eas build`, device install (ADR-0012); agents never run `eas *`.
Runtime proof (P4, P5 and once before the team report): `pnpm db:reset` → `pnpm -F @tanren/worker exec wrangler dev --port 8798 &` → `EXPO_PUBLIC_API_URL=http://localhost:8798 pnpm web:export` → `pnpm web:serve` on **8799** → `ui-check`: open `/program`, enrol, Start, let two phases pass (TestClock not available: use short dev durations via `EXPO_PUBLIC_PLAYER_SPEED=10` **VERIFY** env inlining), Finish → `/today` history shows the session; `curl` `/sync/pull` shows `programDayCompletion`. Expo Go on a phone is an owner proof; the report states what was proven where.
Docs: `apps/mobile/CLAUDE.md` (team-lead: Layout + §programs + store v2) · `expo-mobile` skill (P6: notifications/keep-awake/haptics/audio facts, Live Activity paragraph with owner actions) · `docs/design/v2-programs.md` corrections through the team-lead with a Log line.
Budget: ≤ 3 engineers in parallel · one reviewer for the team (after P4/P5) · ≤ 2 review rounds · target ≤ 120 min wall-clock after F2.
Forbidden: never run a command under permissions.ask: `git push|reset|checkout`, `rm -r*`, `wrangler deploy|login|secret|d1 execute`, `eas *`, Cloudflare MCP `execute`; `pnpm db:reset` is fine. Ports other than 8798/8799. Editing MOBILE-2, mcp-oauth, AUTH-1 or catalog paths. `expo-av`. A second `SqlDriver` opener.
Report: team report format from `.claude/agents/team-lead.md`; list every announced one-line edit outside owned paths.

## Decisions
- D1 Program definitions static in shared, progress in two synced tables; completion logs a normal session (`reps` = seconds, ADR-0007 Q4) — accepted (Lead delegation); ADR-0013 covers static shared data.
- D2 One migration `0002_v2.sql` for both teams, generated by V2-F1 (single owner of `packages/db/migrations`) — accepted (Lead delegation).
- D3 Remaining time = `endsAt − now`, never ticks; one local notification per phase; `PhaseAlerts` port with notifications (Expo Go) and Live Activity (dev build) adapters — accepted (Lead delegation).
- D4 Live Activity via `expo-widgets` config plugin in a dev client; moving the owner's phone off Expo Go — **proposed-pending-owner (ADR-0012)**; everything else in ADR-0012 accepted.

## Tasks
| id | title | role/model | group | files | depends on | done when |
| --- | --- | --- | --- | --- | --- | --- |
| V2-F1 | shared + db foundation: `catalog/taxonomy.ts`, `program.ts` entities, `programs/Program.ts`, ids, `EntityName`/`SyncTable`/`SyncChange`/`ROW_*`, Drizzle `schema/program.ts` + `exercise.catalogId`, `0002_v2.sql`, `SyncStore` parents/immutables, barrel lines, seed `catalogId` keys | engineer/opus | F (first, alone) | v2-programs.md §6 list + v2-catalog.md §2 taxonomy, §4, §3 seed re-key | — | root `pnpm check` green; parity test covers new tables; workerd test: completion without enrollment → `missingParent` |
| V2-F2 | mobile foundation: deps (`react-native-svg`, `expo-notifications`, `expo-haptics`, `expo-audio`, `expo-keep-awake`, `expo-widgets`) pinned in catalog via `npx expo install --check`, store migration v2, tab stubs `library`/`program`, `app.json` plugins (notifications; widgets commented until P7), `expo-types.d.ts` | engineer/opus | F (∥ F1; disjoint files) | §6 F2 list | — | `pnpm -F @tanren/mobile check` green; migrations test asserts v2 columns; `expo export --platform web` bundles |
| V2-P1 | `CORE30` data + programs test | engineer/sonnet | A | `shared/src/programs/core30.ts`, `programs.test.ts` | F1 | §3 table encoded; test 1–4 of §1 green |
| V2-P2 | `playerMachine` pure state machine + tests | engineer/sonnet | A | `src/player/**` | F2 | all events × states tested, incl. resume after background (endsAt recompute) |
| V2-P3 | `ProgramRepo` (enrol/abandon/todayFor/complete without logging) + `PhaseAlerts` port + notifications adapter | engineer/opus | A | `services/ProgramRepo*.ts`, `PhaseAlerts*.ts`, runtime line | F1, F2 | node:sqlite tests: enrol → currentDay bump → rows dirty; adapter unit-tested behind a fake `Notifications` |
| V2-P4 | Program tab + player screen + `usePlayer` (keep-awake, haptics, audio) + completion sheet; two-column aside | engineer/opus | B (after P2, P3, design foundation) | `app/(tabs)/programs.tsx`, `app/programs/**`, components, `hooks/usePlayer.ts`, `assets/sounds/beep.wav` | P2, P3, design-system foundation | ui-check proof per charter on :8799 both widths |
| V2-P5 | completion → session + sets via `ExerciseLink`; Today banner; `requestSync` | engineer/opus | B (after P3 and catalog C3) | `ProgramRepo.ts` (complete), `TodayReady.tsx` banner | P3, catalog C3 | sets `reps`=seconds, order sequential; pull shows session + completion |
| V2-P6 | docs + skill: CLAUDE.md §programs, expo-mobile facts, VERIFY lines resolved | engineer/sonnet | C | docs/skills only | P4, P5 | every §4/§7 VERIFY replaced by a fact + source |
| V2-P7 | Live Activity adapter (`src/native/RestActivity.ts`, `'widget'` component, `app.json` widgets plugin, `eas.json` dev profile, env-based adapter selection) | engineer/opus | C (gated: spike note landed) | `src/native/**`, `app.json`, `eas.json`, runtime selection line | P3, S-NATIVE-SPIKE note | typecheck green with `expo-widgets` types; Expo Go path still selects notifications; owner actions listed in report |
| V2-REV | one reviewer for the team | reviewer/opus | after P4, P5 | `git diff <baseline> -- <owned paths>` | — | APPROVE; blocking findings routed inside the team |

## Done-criteria (team)
- Root `pnpm check` green with F1/F2 + all tasks; `0002_v2.sql` applies on a fresh local D1 and on the seeded one.
- Charter runtime proof pasted; completion visible through pull; Today history shows the Core 30 session.
- ADR-0012 owner actions listed in the report; no `eas`/deploy command executed.

## Frozen contracts
v2-programs.md §1 schemas, §2 tables/sync rules, §4 `PhaseAlerts` port, §5 logging rule, §6 owners · v2-catalog.md §2 taxonomy, §4 `ExerciseLink`.

## Log
`HH:MM→HH:MM · task · role/model · agent id · tokens · tool uses · rounds · outcome`
- 2026-10-21 · created from architect breakdown (v2-programs.md written the same hour)

## Briefs (ready to paste; each adds the charter's Forbidden line and `Report: engineer format, gate output pasted`)
### V2-F1 (opus, Time box 35 min)
Read `docs/design/v2-programs.md` §1–2, §6 and `docs/design/v2-catalog.md` §2 (taxonomy only), §3 (seed re-key), §4. Load `effect-conventions`, `cloudflare-workers`, `monorepo`. Create `packages/shared/src/catalog/{taxonomy,index}.ts` (taxonomy + barrel only; no data), `programs/Program.ts` + `programs/index.ts` (schemas, `PROGRAMS = []` for now), `program.ts` entities + ids; extend `common.ts`, `sync.ts`, `row.ts`, `exercise.ts` (`catalogId`), barrel. `packages/db`: `schema/program.ts`, `exercise.catalogId`, `drizzle-kit generate --name v2` → `0002_v2.sql`, `SyncStore` parents/IMMUTABLE/exhaustive matches, parity test, seed `catalogId` per §3. Fix every compile error the union growth causes in `packages/db` and `apps/worker` (announce any file outside the §6 list). Done: root `pnpm check` green, outputs pasted; workerd test for `missingParent` on completion.
### V2-F2 (opus, Time box 30 min)
Read v2-programs.md §2 (mobile store), §6; v2-catalog.md §5 (deps). Load `expo-mobile`, `monorepo`. `npx expo install --check` for the §6 dep list; pin in `pnpm-workspace.yaml` catalog + `apps/mobile/package.json`; `pnpm install`. Store migration v2 (append-only) + `migrations.test.ts`. Tab stubs `app/(tabs)/library.tsx`, `app/(tabs)/programs.tsx` ("Coming soon" `Screen`), `_layout.tsx` tabs, regenerate `expo-types.d.ts` via `expo start` once (kill it). `app.json`: `expo-notifications` plugin (`enableRemoteNotifications: false`). Done: `pnpm -F @tanren/mobile check` + `expo export --platform web` green, pasted.
### V2-P1 (sonnet, 20 min) — v2-programs.md §3 exactly; ids only from `CORE30_CATALOG_IDS`; tests §1.
### V2-P2 (sonnet, 25 min) — `src/player/playerMachine.ts` + test per §4; pure, no Date/timers; `Match` exhaustive.
### V2-P3 (opus, 35 min) — §4 `ProgramRepo` (no logging yet; `complete` writes completion + currentDay), §4 `PhaseAlerts` port + `PhaseAlerts.notifications.ts` (expo-notifications, permission once, cancel on change) + web no-op; runtime one-line; node:sqlite tests.
### V2-P4 (opus, 45 min) — §4 screens + `usePlayer`; `useKeepAwake`; cues; placeholder illustration until `ExerciseIllustration` lands; ui-check proof on :8799 at 390 and 1280 widths; load `frontend-design:frontend-design`, `expo:expo-animation`.
### V2-P5 (opus, 30 min) — §5 logging through `ExerciseLink.ensure`; Today banner; `requestSync` via the existing hook handle; test: 7 items × 3 rounds → 21 sets, `reps` = seconds.
### V2-P6 (sonnet, 20 min) — docs/skill only; resolve VERIFY lines with sources.
### V2-P7 (opus, 40 min, gated) — §7; read the spike note first; `expo-widgets` types; adapter selection; `eas.json`; no `eas` command; report owner actions verbatim from ADR-0012.

## Reconciliation with `docs/tasks/v2-design.md` / `v2-extras.md` (architect, 2026-10-21; Lead confirms)
- Design D1 owns `app/(tabs)/_layout.tsx` (five tabs incl. `programs`, `library`), `src/components/**`, `app/_layout.tsx` and the `react-native-svg` dep (15.16.0). **V2-F2 therefore drops** the tab stubs, `_layout.tsx` and `react-native-svg`; it keeps `expo-notifications`, `expo-haptics`, `expo-audio`, `expo-keep-awake`, `expo-widgets`, the store migration v2 and `app.json` plugins. Routes follow ADR-0014: `app/(tabs)/programs.tsx`, `app/(tabs)/library.tsx`.
- Team components live in feature folders, not `src/components/**`: programs → `src/player/components/**`, catalog → `src/library/**` (incl. `ExerciseIllustration.tsx`).
- Ports (ADR-0013): extras (team design) 8793/8795, programs 8798 (wrangler) + 8799 (web), catalog 8797/8796.
- `pnpm-lock.yaml` / catalog edits: F2 and design D1 both add deps — run D1 first or F2 first, never concurrently (lockfile is single-owner per wave).
