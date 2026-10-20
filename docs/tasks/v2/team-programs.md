# Team sheet: programs (v2)
Charter: `docs/tasks/v2-programs.md` · Design: `docs/design/v2-programs.md` · Team-lead start 00:34 · Box 100 min → 02:14
Owned paths: see charter. Extra grants from the Lead's dispatch: `app/(tabs)/programs.tsx` (replace placeholder), `src/player/**` (incl. components), one announced line in `src/services/runtime.ts` `AppLayer`, `docs/design/v2-programs.md` §3 table (P1).
Not ours (live): `app/(tabs)/_layout.tsx`, `src/ui/**`, `src/components/**` (design) · `src/services/{NativeSession,magicLink,CurrentUser,SyncTransport}.ts`, `app/auth/**` (NA-2) · `packages/shared/src/catalog/**` (catalog) · `useSync.ts`, `useLogSet.ts`, `SyncEngine.ts`, `StoreEvents.ts` (MOBILE-2, read-only).

## Assumes (cross-team) — copied from the charter
- catalog: `CORE30_CATALOG_IDS` in `catalog/core30Ids.ts` (V2-C0) with `kind: "timed"` entries in `data/core.ts` (C1); `ExerciseLink.ensure(catalogId): Effect<ExerciseId, StoreError>` + `layerNoDeps` (C3) — P5 only; P5 waits for the Lead's "C3 reported".
- F1 taxonomy (`Slug`, `CatalogId`) in `catalog/taxonomy.ts` — landed (F1 committed).
- design: `src/ui/**` primitives exist (D1 committed, barrel frozen); `ExerciseIllustration` (catalog, `src/library/**`) — P4 renders a placeholder until the Lead says it landed.
- MOBILE-2: `SyncEngine` iterates `SYNC_TABLE_ORDER` generically; a needed edit is escalated.
- Lead/owner: Apple account, `eas build`, device install (ADR-0012); agents never run `eas *`.
- Proof CORS: worker `ALLOWED_ORIGINS` (wrangler.jsonc:10) is `http://localhost:8081,http://localhost:8790` — no `:8799`. Proof overrides it on the command line (`wrangler dev --var ALLOWED_ORIGINS:…`, VERIFY flag), no file edit.

## Tasks
| id | title | model | group | depends | box | status |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | CORE30 data + programs test + `PROGRAMS` entry; §3 table fitted to 12–18 min | sonnet | A | F1, C0 ids file | 15 | done |
| P2 | `playerMachine` pure state machine + tests | opus | A | F2 | 15 | done |
| P3 | `ProgramRepo` (enroll/abandon/active/todayFor/complete w/o logging) + `PhaseAlerts` port + notifications adapter + runtime line | opus | A | F1, F2 | 20 | done |
| P4 | Programs tab + `app/programs/play.tsx` + `usePlayer` + completion sheet; runtime proof | opus | B | P1, P2, P3 | 25 | done |
| P5 | `complete` logs session + sets via `ExerciseLink`; Today banner; requestSync | opus | B | P3, C3 | 15 | done |
| P6 | docs: expo-mobile skill facts, VERIFY lines resolved | sonnet | C | P4, P5 | 10 | done |
| P7 | Live Activity | — | gated | — | — | not this run (Lead: port + notifications adapter only) |
| REV | reviewer | opus | after P4/P5 (rolling: P1–P3 early) | — | 8 | done (APPROVE r3) |

## Frozen interfaces (written at dispatch; P4/P5 build on them)
- `ProgramRepo` (P3): `enrollments: Effect<ReadonlyArray<ProgramEnrollment>, StoreError>` (live, newest first) · `active: Effect<Option<ProgramEnrollment>, StoreError>` · `enroll(programId: ProgramId): Effect<ProgramEnrollment, StoreError>` (existing active one for that program is returned, not duplicated) · `abandon(id: ProgramEnrollmentId): Effect<void, StoreError>` · `todayFor(e: ProgramEnrollment): Option<ProgramDay>` (pure; None when completed or program unknown) · `complete(input: CompletionInput): Effect<ProgramDayCompletion, StoreError>` with `CompletionInput = { enrollmentId, dayNumber: DayNumber, startedAt: DateTime.Utc, durationSeconds: number }`.
- `PhaseAlerts` (P3): `schedule(at: DateTime.Utc, text: string): Effect<void>` · `cancelAll: Effect<void>`; never fails (adapter logs and swallows); permission asked lazily once on first `schedule`; `layer` = notifications adapter on native, no-op on web; `layerTest(log)` records calls.
- `playerMachine` (P2): see P2 brief; FROZEN when P2 reports.

## Integration checklist
- [ ] `src/services/runtime.ts` · `AppLayer` mergeAll gets one line `ProgramRepo.layerNoDeps` + `PhaseAlerts.layer` (P3) and catalog's `ExerciseLink.layerNoDeps` · if P5 makes `ProgramRepo` require `ExerciseLink`, the programs line becomes `ProgramRepo.layerNoDeps.pipe(Layer.provide(ExerciseLink.layerNoDeps))` or the catalog line moves into a provideMerge below · verify `pnpm -F @tanren/mobile test -- runtime`

## Log
`HH:MM→HH:MM · task · role/model · agent id · tokens · tool uses · rounds · outcome`
- 00:38→00:42 · P1 · engineer/sonnet · ab08156290e3e7eb9 · 103k · 16 · 1 · done: CORE30 + 12 tests, §3 re-fitted (15.25→17.75 min; 5 s rest late weeks), shared 249 green; core30Ids landed in time (no INTEGRATION fallback)
- 00:38→00:42 · P2 · engineer/opus · a4013f88f24638e4a · 112k · 14 · 1 · done: playerMachine + 29 tests; duration excludes pauses; phaseKey also changes on pause/resume (P4 compares _tags) — FROZEN 00:42
- 00:38→00:42 · P3 · engineer/opus · ab71197a365327815 · 138k · 26 · 1 · done: ProgramRepo (6 tests), PhaseAlerts port + notifications adapter (lazy import(), no-op web/fallback), runtime line + 2 imports; mobile 338 green; web export bundles — FROZEN 00:42
- 00:43→00:52 · P4 · engineer/opus · ad28305ad984130da · 186k · 72 · 1 · done: tab + play route + usePlayer + cues/playerEffects/useProgramDay + components + beep.wav; 46 tests; mobile check 379 green; ui-check 390/1280 on scratch export :8799 (signed-out)
- 00:43→00:48 · P5 · engineer/opus · aa07901a2ed60f355 · 140k · 47 · 1 · done: complete logs session + sets via ExerciseLink in one batch; runtime line provides ExerciseLink; 377 green
- 00:43→00:46 · REV r1 (P1–P3) · reviewer/opus · acdc32014f3542958 · 110k · 21 · — · REQUEST CHANGES: blocker = runtime evidence for PhaseAlerts dynamic imports (→ P4 r1 proof); should: complete status/currentDay (→ P5 r1), enroll concurrency test (→ P5 r1); phaseKey drift handled by P4 cueFor
- 00:53→00:54 · P6 · engineer/sonnet · a022e1f00177c8328 · 84k · 20 · 1 · done: expo-mobile "Programs / player (v2)" section; §2/§4 VERIFYs replaced (SyncStore pre-checks unique slots in memory → invariantViolated, SyncStore.ts:291-336); §7 left open (P7 gated)
- 00:53 · P5 r1 (reviewer 3/4/5) dispatched → aa07901a2ed60f355 · P4 r1 (iOS bundle + full-stack signed-in proof) → ad28305ad984130da · interim sent to Lead (TodayReady banner escalation)
- 00:55 · REV r2 delta (P4 + P5) → acdc32014f3542958
- 00:55→00:56 · P5 r1 · aa07901a2ed60f355 · 162k · 15 · r1 · done: Math.max currentDay, EnrollmentNotActive, concurrent enroll test, tests split; 29 green
- 00:55→00:57 · REV r2 delta (P4+P5) · acdc32014f3542958 · 161k · 17 · — · REQUEST CHANGES: A blocker = P4 proof (in flight); B 3-2-1 before work (→ P4); C useProgramDay in src/player vs rules/react.md (→ Lead decision); D/E (→ P4); F doc comment (→ P5 r2); round-1 findings 2–5 closed
- 00:57 · Lead: Today banner waits for "design done", then P5 adds one block to TodayReady.tsx (≤ 30 lines)
- 00:57→00:57 · P5 r2 (nit F) · aa07901a2ed60f355 · 5 tools · done
- 00:53→01:01 · P4 r1 (proof + B/D/E) · ad28305ad984130da · 233k · 49 · r1 · done: iOS bundle has scheduleNotificationAsync/expo-audio/beep; signed-in export run :8799 + worker :8798 (D1 copy, --var ALLOWED_ORIGINS): start→pause→resume→rest→finish→"Logged as session"; pull: enrollment currentDay 2, completion sessionId set, 21 sets; Progress shows session; mobile check 394 green. Found: early Finish logs all 21 planned sets
- 01:02 · decision: CompletionInput += `performedItems` (interface change inside team) → P5 r3 ∥ P4 r2
- 01:02→01:03 · P5 r3 · aa07901a2ed60f355 · 14 · r3 · done: performedItems slice, 0 → no session; 31 green
- 01:02→01:03 · P4 r2 · ad28305ad984130da · 14 · r2 · done: performedBefore counting, Retry same count; 51 green
- 01:03→01:04 · root gate (team-lead): plugins ok; biome ci red only in `apps/mobile/assets/exercises/*.svg` noSvgWithoutTitle ×6 (team illustrations); typecheck exit 0; vitest 105 files / 1104 tests passed
- 01:03 · REV r3 final delta → acdc32014f3542958
- 01:03→01:05 · REV r3 final delta · acdc32014f3542958 · 180k · 8 · — · APPROVE; nits: usePlayer.ts:132 comment (→ P4 r3), Next on a timed item counts it as performed (accepted: Next = done early), performedItems 0 still completes the day (owner note)
- 01:06 · interim to Lead: commit-ready; banner waits for "design done" (P5 aa07901a2ed60f355 idle)

## Demo evidence (P4 r1, 01:01, export built after B/D/E)
- iOS `expo export --platform ios --no-bytecode`: entry .js has `scheduleNotificationAsync` ×3 (`t.scheduleNotificationAsync({content:{body:n},trigger:{type:t.SchedulableTrig…`), `expo-notifications` ×12, `ExpoAudio` ×1, `useAudioPlayer` ×3, beep asset `name:"beep",type:"wav"`.
- Worker :8798 `--persist-to <scratch copy> --var ALLOWED_ORIGINS:http://localhost:8799`; `/health` 200; preflight echoes :8799 + credentials. Web export (`EXPO_PUBLIC_PLAYER_SPEED=10`, bundle has `parseSpeed)("10")`) served `--assets <scratch>/p4-dist3` on :8799. Magic link → get-session `dev@tanren.local` (link host rewritten :8787→:8798).
- 390 px: `"Core 30 · Day 1 of 30"`, `"7 exercises · 3 rounds · ≈ 15 min"` → `heading "Work Dead Bug Round 1 of 3, exercise 1 of 7"`, `timer "2 seconds left"` → `timer "1 seconds left"` → Pause `heading "Paused Dead Bug …"` (timer frozen over 1.5 s) → Resume `heading "Rest Rest Round 1 of 3, exercise 1 of 7"`, `"Up next"`, `"Crunch · 25 s"` → Finish `"Workout complete"`, `"0:28"`, `"Logged as session"`; `POST :8798/sync/push 200`; `ab errors` empty.
- 1280 px: `complementary` with `"Day 1 · Foundation, Done"`, `"Day 2 · Foundation, Today"`.
- `/sync/pull`: programEnrollment 1 (core-30, currentDay 2, active), programDayCompletion 1 (day 1, dur 28, sessionId e96ef314…), 21 sets linked to that session. Progress: `"21 Oct · 0 min · 21 sets · 7 exercises"`. (Run predates r2 performedItems: an early Finish now logs only performed item-rounds.)
- 01:06 · P5 r4 Today banner (Lead grant TodayReady.tsx) → aa07901a2ed60f355
- 01:06→01:07 · P5 r4 · aa07901a2ed60f355 · 13 · r4 · done: TodayReady ListRow "Core 30 · Day N" (+19/−1) via useProgramDay + pure programBanner (2 tests); mobile 451 green. Team-lead read the diff (no extra reviewer round: 19 lines, pure helper tested)
- 01:07 · final package gates (team-lead): shared check 257 green; mobile tsc ok, biome src+app 185 files clean; root vitest 106 files / 1106 passed; root biome red only assets/exercises/*.svg (illustrations). Team wall-clock 00:34→01:08 = 34 min of 100.
