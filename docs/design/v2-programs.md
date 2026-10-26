# v2 — Guided programs (Core 30, workout player, progress sync, Live Activity)

Status: normative for team **programs** (`docs/tasks/v2-programs.md`). Decisions `accepted (Lead
delegation)` except the move off Expo Go for Live Activities (ADR-0012, proposed-pending-owner on that
point only). Native facts come from S-NATIVE-SPIKE (`docs/research/2026-10-21-live-activities-spike.md`);
the §2 and §4 items are verified (sources inline); the **VERIFY** items left in §7 are open (P7). UI tokens/primitives:
`docs/design/design-system.md`, `apps/mobile/src/ui/**`. Catalog ids: `docs/design/v2-catalog.md` §3.

## 1. Model — program definitions are static shared data; progress is synced rows

A *program* (what to do on day N) is code in `packages/shared/src/programs/`, like the catalog
(ADR-0013). What the user did is two new synced tables (§2). No change to `plan*` tables: a program
is not a plan; completing a program day logs an ordinary `session` + `set`s (§5), so history and
MCP tools see it with no new code.

```ts
// programs/Program.ts
export const ProgramId = Slug.pipe(Schema.brand("ProgramId"))          // "core-30"
export const DayNumber = Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 365 }))
export const Seconds = Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 3600 }))
export const ProgramItem = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("timed"), catalogId: CatalogId, seconds: Seconds, restSeconds: RestSeconds }),
  Schema.Struct({ kind: Schema.Literal("reps"),  catalogId: CatalogId, reps: Reps,       restSeconds: RestSeconds }),
])
export const ProgramDay = Schema.Struct({
  dayNumber: DayNumber,
  title: Label,                                   // "Day 12 · Build", "Day 7 · Recovery"
  rounds: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 5 })),
  items: Schema.Array(ProgramItem).check(Schema.isMinLength(1), Schema.isMaxLength(12)),
  restBetweenRoundsSeconds: RestSeconds,
})
export class Program extends Schema.Class<Program>("@tanren/shared/Program")({
  programId: ProgramId, name: Label, tagline: Note, description: Text,
  days: Schema.Array(ProgramDay).check(Schema.isMinLength(1), Schema.isMaxLength(365)),
}) {}
export const PROGRAMS: ReadonlyArray<Program>; export const findProgram: (id: ProgramId) => Option.Option<Program>
export const dayDurationSeconds: (day: ProgramDay) => number   // Σ rounds × (work + rest) + round rests
```
`programs/core30.ts` exports `CORE30: Program` (§3). Test (`programs/core30.test.ts`): day numbers 1…30
contiguous; every `catalogId` ∈ `CORE30_CATALOG_IDS` and `kind` equals the catalog entry's `kind`;
`dayDurationSeconds` between 12 and 18 min on non-recovery days; day 30 ≥ day 1.

## 2. Progress tables (foundation V2-F1: shared + Drizzle + migration `0002_v2.sql`; V2-F2: mobile store v2)

```ts
// shared/program.ts (entity file; name after the domain)
export const EnrollmentStatus = Schema.Literals(["active", "completed", "abandoned"])
export const ProgramEnrollmentFields = {
  programId: ProgramId, startedOn: LocalDate, status: EnrollmentStatus,
  currentDay: DayNumber,                        // next day to do; = days.length+1 ⇒ completed
}
export class ProgramEnrollment extends Schema.Class<…>("@tanren/shared/ProgramEnrollment")({ ...rowFields(ProgramEnrollmentId), ...ProgramEnrollmentFields }) {}
export const ProgramDayCompletionFields = {
  enrollmentId: ProgramEnrollmentId, dayNumber: DayNumber, completedAt: Timestamp,
  durationSeconds: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  sessionId: Schema.OptionFromNullOr(SessionId),  // the logged session (§5); None if logging failed
}
export class ProgramDayCompletion … ("@tanren/shared/ProgramDayCompletion")
// ids.ts: ProgramEnrollmentId, ProgramDayCompletionId (branded Uuid). Insert/Patch derived as elsewhere.
```
- `EntityName` += `"programEnrollment" | "programDayCompletion"`; `SyncTable` picks both;
  `SYNC_TABLE_ORDER` appends them **after `"set"`** (completion references `sessionId`, which is
  nullable and not a parent); `SyncChange` += two members; `ROW_TABLE`: `program_enrollment`,
  `program_day_completion`; `ROW_KEYS` from the new `*Row` codecs (no JSON columns).
- Drizzle `packages/db/src/schema/program.ts`: `program_enrollment(rowColumns, program_id text NN,
  started_on text NN, status text NN, current_day integer NN)` + `userSeqIndex` + unique
  `(user_id, program_id) WHERE deleted_at IS NULL AND status = 'active'`;
  `program_day_completion(rowColumns, enrollment_id text NN, day_number integer NN, completed_at
  text NN, duration_seconds integer NN, session_id text)` + `userSeqIndex` + unique
  `(enrollment_id, day_number) WHERE deleted_at IS NULL`. Migration `0002_v2.sql` also carries
  `exercise.catalog_id` (v2-catalog.md §4). `drizzle-kit generate` (ADR-0006 §2); parity test extended.
- `SyncStore` (`packages/db/src/sync/SyncStore.ts`): parents — completion → `enrollmentId` must exist
  (`missingParent`); `IMMUTABLE`: enrollment `programId`, `startedOn`; completion `enrollmentId`,
  `dayNumber`. Everything else LWW per data-model.md §10.2 (no server-side uniqueness beyond the
  indexes; a second active enrollment for the same program is rejected `invariantViolated`).
  Verified: `SyncStore` does not map D1 unique-constraint errors (no `UNIQUE` handling exists). It
  pre-checks every partial-unique slot in memory (`uniqueSlot`, `SyncStore.ts:291-311`, which includes
  `activeEnrollmentSlot` and `completionDaySlot`; the `held` map, `:240-244`) and rejects the change
  with `invariantViolated` before any write (`:325-336`), because a violation would abort the whole
  D1 batch. The unique indexes stay as the backstop.
- Mobile store migration v2 (`apps/mobile/src/store/migrations.ts`, append-only): the two tables
  with quoted camelCase columns + `_dirty`/`_rejected` + dirty index, and
  `ALTER TABLE "exercise" ADD COLUMN "catalogId" TEXT`. `syncQueries`/`LocalStore`/`SyncEngine`
  are table-generic over `SYNC_TABLE_ORDER`/`ROW_TABLE`/`ROW_KEYS` and need no edit. Verified
  (`git log -3 --stat -- apps/mobile/src/services/LocalStore.ts`, commit `42b1e3d`): `SyncEngine`
  and `syncQueries` were not touched; F2 only edited `LocalStore.ts` (two new `recordMember`
  entries in `LocalChange`, plus `toSqlRecord`, which stores the absent optional `catalogId` key as
  NULL). `ProgramRepo` rows push through the generic path.

## 3. Core 30 (`packages/shared/src/programs/core30.ts`, sonnet, data only)

30 days, 7 timed items per day, 3 rounds (recovery days 7/14/21/28: 4 mobility/core items × 1 round,
≈ 6 min). Progression, 7 items chosen from `CORE30_CATALOG_IDS`, cycling three templates (A anterior,
B oblique/anti-rotation, C posterior/hip-flexor) so consecutive days differ:

| days | work s | rest s | round rest s | ≈ min |
| --- | --- | --- | --- | --- |
| 1–6 | 25 | 15 | 60 | 15.25 |
| 8–13 | 30 | 15 | 45 | 16.5 |
| 15–20 | 35 | 10 | 45 | 16.75 |
| 22–27 | 40 | 5 | 45 | 17.0 |
| 29–30 | 45 | 5 | 15 | 17.75 |

Recovery days (7/14/21/28): 4 items × 1 round, 75 s work, 20 s rest = 6.0 min. Minutes are
`dayDurationSeconds` (3 rounds × (7 × work + 6 × rest) + 2 × round rest), all inside 12–18; work goes
up, rest and round rest go down, and the load never falls (day 30 = 17.75 min ≥ day 1 = 15.25).
Templates cycle by day number: item list = template `(dayNumber − 1) mod 3` (A, B, C).

Titles: `Day N · Foundation` (1–6), `Build` (8–13), `Endure` (15–20), `Forge` (22–27), `Peak` (29–30),
`Recovery` (7/14/21/28). Every item `kind: "timed"`; `restSeconds` of the last item of a round = round rest.

## 4. Workout player (mobile, Effect only in services; components plain React)

- Service `apps/mobile/src/services/ProgramRepo.ts`: `enrollments`, `enroll(programId)`,
  `abandon(id)`, `todayFor(enrollment): ProgramDay`, `complete(enrollmentId, dayNumber,
  durationSeconds): Effect<ProgramDayCompletion, StoreError>` (writes completion, bumps
  `currentDay`, calls §5 logging, all dirty-marked, emits `StoreEvents`). Added to `AppLayer` in
  `runtime.ts` (one line, announced; §6 ownership).
- Pure player state machine `src/player/playerMachine.ts` (tested with no timers):
  `PlayerState = Idle | Working{round,itemIndex,endsAtMs} | Resting{round,itemIndex,endsAtMs} |
  Paused{inner, remainingMs} | Done{durationSeconds}`; events `start | tick(nowMs) | pause | resume
  | next | previous | finish`. Remaining time is **always** `endsAtMs - nowMs` (recomputed on
  `AppState` → `active`), never counted ticks: JS timers do not run in the background (spike).
- Hook `src/hooks/usePlayer.ts`: 250 ms interval while foregrounded, `useKeepAwake()`
  (`expo-keep-awake`, in Expo Go), cues at phase change: `Haptics.notificationAsync(Success)` on
  work→rest, `impactAsync(Heavy)` 3-2-1 before work, `expo-audio` short beep (bundled
  `assets/sounds/beep.wav`, 6.7 KB) — foreground only. Verified: `expo-audio` supports web (installed
  `expo-audio/build/ExpoAudio.web.d.ts` exports `useAudioPlayer`), so no `<audio>` fallback; the beep
  bundles into the web export. Haptics are skipped on web behind `Platform.OS === "web"`
  (`usePlayer.ts`, `haptic`). `useKeepAwake` lives in a `KeepAwake` component in
  `app/programs/play.tsx`, mounted only while `isRunning(player)` (`player/cues.ts`: Working or
  Resting). `EXPO_PUBLIC_PLAYER_SPEED` (static `process.env` access, `usePlayer.ts`) is inlined at
  export time and divides every duration (dev/proof only).
- Rest/backgrounding fallback (ships in Expo Go): on entering `Resting` or `Working` schedule one
  `expo-notifications` local notification at `endsAt` (`SchedulableTriggerInputTypes.TIME_INTERVAL`,
  body "Rest over — Plank, 40 s"), cancel it on `next/pause/finish`; permission asked once at first
  `start` (`requestPermissionsAsync`, iOS `ios.status`). Web: skipped. Port
  `src/services/PhaseAlerts.ts` with `schedule(at, text)`/`cancelAll()`; the Live Activity (§7)
  is a second implementation of the same port. Verified against `expo-notifications` 58.1.5
  (`PhaseAlerts.notifications.ts`): `scheduleNotificationAsync` with `{ type:
  SchedulableTriggerInputTypes.TIME_INTERVAL, seconds }` (at least 1 s), `cancelAllScheduledNotificationsAsync`,
  `requestPermissionsAsync → { granted, ios?.status }`, with `IosAuthorizationStatus.PROVISIONAL`
  counted as granted. The module is loaded by dynamic `import()` while `PhaseAlerts.layer` is built
  (`PhaseAlerts.ts`), so Node tests never load it; a failed import logs a warning and falls back to
  the no-op, which web also uses. No foreground `setNotificationHandler` is set: the alert shows only
  in the background.
- Screens: `app/(tabs)/programs.tsx` (tab "Programs": enrol card for `CORE30` or today's day card
  with item list + "Start"), `app/programs/play.tsx` (full-screen player: illustration via
  `ExerciseIllustration`, big countdown, round/item progress, pause, ‹ ›, finish), completion sheet
  (duration, "logged as session"). Two-column web: day list in `aside`. Today tab shows a one-line
  "Core 30 · Day N" banner linking to the Program tab when an active enrollment exists (edit
  `TodayReady.tsx` only for that banner, announced).

## 5. Completion → history (ADR-0007 Q4)

`ProgramRepo.complete`: one `session` (`startedAt` = player start, `finishedAt` = now,
`plannedSessionId: None`, `notes: "Core 30 · Day N"`) and one `set` per item per round, `order`
sequential, `exerciseId = ExerciseLink.ensure(item.catalogId)` (v2-catalog.md §4, team catalog),
`weightKg: 0`, `reps = seconds` for timed / `reps` for reps items, `rpe: None`, `plannedSetId: None`,
`loggedAt` = that item's end. All rows dirty; `requestSync` afterwards (via the existing `useSync`
`requestSync` handle — do not edit `useSync.ts`, MOBILE-2 owns it).

## 6. Shared-file owners inside this scope (one owner per line)
`packages/shared/src/index.ts` barrel, `ids.ts`, `common.ts` (`EntityName`/`SyncTable`), `sync.ts`,
`row.ts`, `packages/db/src/schema/**`, `packages/db/migrations/**`, `SyncStore.ts` → **V2-F1**
(foundation engineer, before fan-out). `apps/mobile/src/store/migrations.ts`, `app/(tabs)/_layout.tsx`
(adds `library` + `programs` tabs pointing at stub screens), mobile `package.json` deps
(`react-native-svg`, `expo-notifications`, `expo-haptics`, `expo-audio`, `expo-keep-awake`,
`expo-widgets` — versions from `npx expo install --check` / SDK 58 bundledNativeModules, pinned in the
catalog), `app.json` plugins → **V2-F2**. `apps/mobile/src/services/runtime.ts` `AppLayer`: catalog adds
`ExerciseLink.layerNoDeps`, programs adds `ProgramRepo.layerNoDeps`; each a one-line insert
announced in the report; the integration task resolves a conflict (MOBILE-2 owns `failureMessage` only).

## 7. Live Activity (Dynamic Island + Lock Screen) — gated task, dev build only (ADR-0012)

Facts (spike, **VERIFY** against `expo-widgets@~58.0.21` types; open — P7 gated, ADR-0012): `createLiveActivity(name, component)`
→ `.start(props, url?, staleDate?)`, `.update(props)`, `.end()`; the component carries the `'widget'`
directive, uses only `@expo/ui/swift-ui` (no hooks/imports/module-scope values), returns
`banner/compactLeading/compactTrailing/minimal/expanded*` regions; `Text`/`ProgressView` with
`timerInterval` + `countsDown` tick system-side, so **one `start({ title, endsAt })` per phase**, no
per-second updates (Apple: 8 h, 4 KB payload, throttled). Not in Expo Go.
- `src/native/RestActivity.ts` implements the `PhaseAlerts` port with `expo-widgets`, loaded with
  `requireOptionalNativeModule`-style guard (**VERIFY** the Expo 58 idiom; open — P7 gated, ADR-0012) so Expo Go/web get the
  notifications implementation; selection in `runtime.ts` by `Constants.executionEnvironment`
  (**VERIFY** value for a dev client vs `"storeClient"` for Expo Go; open — P7 gated, ADR-0012).
- `app.json`: `expo-widgets` plugin with one Live Activity, `ios.bundleIdentifier` (required for the
  app group), `frequentUpdates: false`. Also add `eas.json` with a `development` profile
  (`developmentClient: true`, `distribution: "internal"`). Agents never run `eas *`.
- Owner actions (ADR-0012): paid Apple Developer account; `eas login`; `eas device:create`; `eas build
  --profile development --platform ios`; install; `expo start --dev-client`. Proof is the owner's.

## 8. Not decided here
Programs beyond Core 30; programs with `reps` items in the UI (model supports, player shows "Done"
button instead of a countdown — implement, but no data uses it); Android; remote (push) Live
Activity updates; a programs MCP tool.

## 9. Amendment 2026-10-26 — rep targets (plan Amendment 11, ADR-0020)

§3 "every item `kind: "timed"`" and §8 "no data uses reps" are superseded. Normative for
`docs/tasks/v4-program-reps.md`; §1–§7 stay as written except where this section says otherwise.

**Rule** (ADR-0020 §2): the catalog `kind` decides the item mode. Timed: `plank`, `side-plank`,
`hollow-hold`, `superman-hold`, `leg-raise-hold`, `bear-crawl-hold`, `mountain-climber`, `high-knees`,
`flutter-kick`. Reps (flip `data/core.ts` to `kind: "reps"`): `dead-bug`, `crunch`, `reverse-crunch`,
`lying-leg-raise`, `v-up`, `bicycle-crunch`, `russian-twist`, `heel-touch`, `plank-hip-dip`,
`plank-shoulder-tap`, `glute-bridge`, `bird-dog`, `scissor-kick`, `sit-up`, `toe-touch-crunch`.

**Counts** `REPS_BY_WORK_SECONDS` (core30.ts): 25 → 12, 30 → 16, 35 → 18, 40 → 20, 45 → 22, 75 → 20.
`SECONDS_PER_REP = 2` (Program.ts). Rest and round-rest seconds unchanged from the §3 table.

**Core 30 re-classified** (templates cycle by `(dayNumber − 1) mod 3`; T = timed `seconds` = phase
work s, R = reps = count for the phase; `restSeconds` as §3):

| template | items (mode) |
| --- | --- |
| A (days 1,4,10,13,16,19,22,25) | dead-bug R · crunch R · reverse-crunch R · lying-leg-raise R · v-up R · hollow-hold T · plank T |
| B (days 2,5,8,11,17,20,23,26,29) | bicycle-crunch R · russian-twist R · side-plank T · heel-touch R · plank-hip-dip R · mountain-climber T · plank-shoulder-tap R |
| C (days 3,6,9,12,15,18,24,27,30) | superman-hold T · glute-bridge R · bird-dog R · flutter-kick T · scissor-kick R · leg-raise-hold T · bear-crawl-hold T |
| Recovery (7,14,21,28, 1 round) | bird-dog R 20 · dead-bug R 20 · glute-bridge R 20 · superman-hold T 75 |

| phase (days) | T seconds | R count | rest | round rest | ≈ min A / B / C |
| --- | --- | --- | --- | --- | --- |
| Foundation 1–6 | 25 | 12 | 15 | 60 | 15.0 / 15.0 / 15.1 |
| Build 8–13 | 30 | 16 | 15 | 45 | 17.0 / 17.0 / 16.8 |
| Endure 15–20 | 35 | 18 | 10 | 45 | 17.0 / 17.0 / 16.9 |
| Forge 22–27 | 40 | 20 | 5 | 45 | 17.0 / 17.0 / 17.0 |
| Peak 29–30 | 45 | 22 | 5 | 15 | — / 17.5 / 17.6 |

Recovery days ≈ 4.3 min (255 s: 3 × 20 reps × 2 s + 75 s hold + 3 × 20 s rest; supersedes §3's 6.0 min).

Minutes use `dayDurationSeconds` with reps at 2 s each (A Foundation: 5·24 + 2·25 = 170 work + 90 rest
= 260 × 3 + 2·60 = 900 s). Every training day stays inside 12–18 min; day 30 (17.6, template C: 4·45 + 3·44 = 312 work) ≥ day 1 (15.0).
Test (`core30.test.ts`) replaces "only timed": every item's `kind` equals its catalog entry's `kind`;
every reps count ∈ {12, 16, 18, 20, 22}, all even; the count of an item equals
`REPS_BY_WORK_SECONDS[phase work s]`.

**Player work screen, reps item** (replaces the ring block of §4 for `endsAtMs: None`; phone 390,
content 358):

```
 [illus 120] Work                      ← header row unchanged (eyebrow / title / "12 reps" subhead)
             Dead Bug
             12 reps
 ┌──────────────── 358 ────────────────┐
 │               12                    │  clock 64/68, accessibilityLabel "12 reps"
 │              reps                   │  caption muted 20, gap 4 → 92
 │         (gap 24)                    │
 │ [✓  Done                       ]    │  Button size="xl" 64, variant primary, stretch 358
 └─────────────────────────────────────┘  block minHeight 220 (= phone ring), content 180 centred
  ‹ 48   ⏸ 64   › 48 · Next · Crunch 12 reps   ← transport row + caption unchanged
```
Heights: 68 + 4 + 20 + 24 + 64 = 180 ≤ 220, so the ring block and the reps block are the same
height and the transport row does not move between items. `onPress` → `send("next")`;
`disabled={paused}`; the timed branch and the desktop branch are untouched. Paused reps item: numeral
stays, eyebrow "Paused" as today. Rest after Done: unchanged (ring, countdown, 3-2-1).

**Unchanged by this amendment**: machine (`endsAtMs: None` path exists), `alertFor` (None on a reps
work phase; rest alert text already carries "N reps"), `ProgramRepo.loggedCount`, progress rows,
`DayItems` / day list (`itemAmount` already prints "12 reps"), Live Activity port (§7).
