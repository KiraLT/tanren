# Programs via MCP and in-app authoring — design (ADR-0026, plan Amendments 21–22)

Scope: user-owned programs (`program` table), enrollment status incl. `paused` with several active programs,
per-enrollment exercise swaps, seven+two MCP tools, the Programs tab / detail / editor screens, Today's due list,
and the second default program "12-Week Lean Build" (§7). Shared vocabulary reused everywhere: `Label` (80), `Note`
(500), `Text` (4000), `Slug`, `CatalogId`, `Weekday`, `LocalDate`, `Timestamp`, `RestSeconds`, `Reps`, `ProgramDay`,
`ProgramItem`, `ProgramId`, `ProgramEnrollment*`, `ProgramDayCompletion*` (`packages/shared/src/{common,program}.ts`,
`catalog/taxonomy.ts`, `programs/Program.ts`; each checked with `grep -n "export const <Name>"`).

## 1. Schemas (`packages/shared/src`) — `Int` below abbreviates `Schema.Number.check(Schema.isInt())` (+ the stated bounds)
`ids.ts`: `UserProgramId = Uuid.pipe(Schema.brand("UserProgramId"))`.
`program.ts` (keeps the enrollment classes; adds):
```ts
export const ProgramSchedule = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("daysPerWeek"), days: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 7 })) }),
  Schema.Struct({ kind: Schema.Literal("weekdays"), weekdays: Schema.UniqueArray(Weekday).check(Schema.isMinLength(1)) }),
])
export const ProgramSource = Schema.Literals(["builtin", "mcp", "manual"])
export const UserProgramSource = Schema.Literals(["mcp", "manual"])           // what a row may hold
export const ProgramDays = Schema.Array(ProgramDay).check(Schema.isMinLength(1), Schema.isMaxLength(84))   // 1–84 (Lead 16:19: the 12-week built-in is 84 days)
export const UserProgramFields = {
  title: Label, slug: Slug /* immutable, unique per user among live rows */, summary: Note,
  description: Schema.OptionFromNullOr(Text), days: ProgramDays, schedule: ProgramSchedule,
  source: UserProgramSource /* immutable */, version: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1)),
}
export class UserProgram extends Schema.Class<UserProgram>("@tanren/shared/UserProgram")({ ...rowFields(UserProgramId), ...UserProgramFields }) {}
export const UserProgramInsert = UserProgram.mapFields(Struct.omit(ROW_COLUMNS))
export const UserProgramPatch = Schema.Struct({ title: Schema.optionalKey(Label), summary: Schema.optionalKey(Note),
  description: Schema.optionalKey(Schema.OptionFromNullOr(Text)), days: Schema.optionalKey(ProgramDays),
  schedule: Schema.optionalKey(ProgramSchedule) })                               // explicit, never derived (shared/CLAUDE.md)
/** `programId` of a row: its UUID (satisfies `Slug`); the test asserts a UUID decodes as `ProgramId`. */
export const programIdOfRow: (id: UserProgramId) => ProgramId   // VERIFY: Schema.decodeSync name in effect@4.0.5; else decodeUnknownOption + getOrThrow in a fixture-only helper
export const toProgram: (row: UserProgram) => Program          // programId = programIdOfRow(row.id), name = title, tagline = summary, description = description | summary
```
`EnrollmentStatus = Schema.Literals(["active", "paused", "completed", "abandoned"])` (adds `paused`; D1 and the mobile
column are unconstrained TEXT — `grep -n CHECK packages/db/migrations/0002_v2.sql` prints nothing).
`ProgramEnrollmentFields` gains `swaps: Swaps` where
```ts
export const Swap = Schema.Struct({ from: CatalogId, to: CatalogId })      // `from` is the ORIGINAL id in the program's days
export const Swaps = Schema.Array(Swap).check(Schema.isMaxLength(30), uniqueBy("from"))   // VERIFY: Schema.isUnique / custom check name
```
`ProgramEnrollmentPatch` gains `swaps: Schema.optionalKey(Swaps)` (explicit struct). `ProgramEnrollmentInsert` requires
`swaps` (callers pass `[]`). Encoded shape on the wire/row: `swaps` as a JSON column (`row.ts` `jsonColumn(Swaps)`,
pattern `locations`). Status rules (write sites): `active → completed` only in `ProgramRepo.complete` (mobile,
`grep -n "completed" apps/mobile/src/services/ProgramRepo.ts`: past the last day) and nowhere else; `paused` freezes
`currentDay` (completing a day while paused fails with the existing `EnrollmentNotActive`) and hides the program from
Today; `active ↔ paused` from the detail screen (P-M3) and `set_enrollment_status`; `abandoned` from "Leave program"
(existing `ProgramRepo.abandon`, mobile) and `set_enrollment_status`; `completed`/`abandoned` are terminal (patch →
`ValidationError "enrollment is <status>"`). Several active enrollments are allowed (one per program, the existing index).
Read model (`program.ts`):
```ts
export const ProgramSummary = Schema.Struct({ programId: ProgramId, title: Label, summary: Note, source: ProgramSource, version: Schema.Int,
  days: Schema.Int, minutesPerDay: Schema.Struct({ min: Schema.Int, max: Schema.Int }) /* dayDurationSeconds/60 rounded */,
  schedule: Schema.OptionFromNullOr(ProgramSchedule) /* None for built-ins */,
  enrollment: Schema.OptionFromNullOr(Schema.Struct({ enrollmentId: ProgramEnrollmentId, status: EnrollmentStatus, currentDay: Schema.Int, startedOn: LocalDate })) })
export const summarize: (program: Program, meta: { source; version; schedule: Option }, enrollment: Option<ProgramEnrollment>) => ProgramSummary
```
`programs/swaps.ts` (pure): `swapCandidates(original: CatalogExercise, catalog, available: ReadonlyArray<CatalogEquipment>): ReadonlyArray<CatalogExercise>`
— same `kind`, ≥ 1 shared `primaryMuscles`, `isAvailableWith(available)` (bodyweight always passes; `available` = active
location's equipment, `catalog/availability.ts` `activeLocation`; no active location → everything passes), excludes the
original, ranked by |primary ∩| desc, |secondary ∩| desc, count of `equipment` tags not in the original asc, `name`; first 8.
`applySwaps(day: ProgramDay, swaps: Swaps): ProgramDay` maps `items[i].catalogId` through `swaps` (`kind` and counts
unchanged). Tests: push-up at a bodyweight-only location never offers `dumbbell-bench-press`; `applySwaps` with `[]` is identity.

## 2. DB + sync — migration `0009_programs.sql` (after nutrition's 0008; `meta/_journal.json` is serial: P-S1 after N-S1)
`packages/db/src/schema/program.ts`: table `program`: `...rowColumns()`, `title TEXT NOT NULL`, `slug TEXT NOT NULL`,
`summary TEXT NOT NULL`, `description TEXT`, `days TEXT NOT NULL` (JSON), `schedule TEXT NOT NULL` (JSON), `source TEXT NOT NULL`,
`version INTEGER NOT NULL`; `userSeqIndex("program", t)`; `uniqueIndex("program_user_slug_unique").on(userId, slug).where(deleted_at IS NULL)`.
`ALTER TABLE program_enrollment ADD COLUMN swaps TEXT NOT NULL DEFAULT '[]'`.
Sync: `EntityName`/`SyncTable` + `"program"`; `SYNC_TABLE_ORDER` appends `"program"` LAST (after `"foodEntry"`; no parent —
enrollments reference by `programId` value, built-ins have no row); `sync.ts` `member("program", UserProgram)`; `row.ts`
`UserProgramRow` (`days`, `schedule` via `jsonColumn`), `ROW_TABLE program: "program"`, `ROW_KEYS`; `ProgramEnrollmentRow`
+ `swaps` jsonColumn. Exhaustive consumers (owner task in brackets): `packages/db/src/sync/SyncStore.ts` `RowByTable`,
encode map, parents `program: () => []`, `IMMUTABLE program: ["slug", "source"]`, unique-violation map
`program_user_slug_unique → RejectReason` (pattern `ACTIVE_ENROLLMENT`) [P-F0]; `apps/worker/src/sync/SyncStore.ts` wrap
[P-F0]; `apps/worker/src/testing/workerdSetup.ts` "0000 to 0009" [P-S1]; `packages/db/src/schema/parity.test.ts` table set
[P-S1]; `packages/db/src/repositories/AccountErasure.ts` TABLES + `DELETE FROM program` [P-S1]; `apps/worker/src/repos/
{MemoryStore,MemoryAccountErasure}.ts` `program` table [P-S1]; `apps/worker/scripts/seed.ts` `program: Effect.void` [P-S1];
mobile `store/migrations.ts` v6 (`table("program", …)`, `dirtyIndex("program")`, `ALTER TABLE program_enrollment ADD COLUMN
swaps TEXT NOT NULL DEFAULT '[]'`), `LocalStore.ts` `recordMember("program", UserProgramRow)`, `DataExport.ts` + table [P-F0].
Assertions that change (P-F0 re-pins, names from `grep -n "SYNC_TABLE_ORDER\|ROW_TABLE\|toEqual" <file>`): `sync.test.ts`
order list (+ `"program"` last); `row.test.ts` `ROW_TABLE` keys and every enrollment round-trip fixture (+ `swaps: []` /
`'[]'`); `program.test.ts` enrollment `{}`-patch test (still zero keys) and insert fixtures (+ `swaps`); `migrations.test.ts`
version count 5 → 6, `program_enrollment` column list + `swaps`; `parity.test.ts` table set + `program`; `MemoryStore`/
`SyncStore` tests whose enrollment fixtures are `new ProgramEnrollment({...})` (+ `swaps: []`).
Repo `packages/db/src/repositories/Program.ts` (`UserProgramRepo`), all writes through `SyncStore.apply` (db.md §3):
```ts
list:        (userId) => Effect<ReadonlyArray<UserProgram>, PersistenceError>                       // live rows, title asc
get:         (userId, id: UserProgramId) => Effect<Option<UserProgram>, PersistenceError>
bySlug:      (userId, slug: Slug) => Effect<Option<UserProgram>, PersistenceError>
put:         (userId, row: UserProgram) => Effect<void, PersistenceError | Forbidden>
softDelete:  (userId, id) => Effect<boolean, PersistenceError>
enrollments: (userId, programId?: ProgramId) => Effect<ReadonlyArray<ProgramEnrollment>, PersistenceError>   // live, startedOn desc
putEnrollment: (userId, row: ProgramEnrollment) => Effect<void, PersistenceError | Forbidden>
completions: (userId, enrollmentId) => Effect<ReadonlyArray<ProgramDayCompletion>, PersistenceError>
```

## 3. MCP contracts (`packages/shared/src/mcp.ts`; names appended to `MCP_TOOLS` by P-S2, `tools/list` 13 → 22)
Reads (`kind: "read"`, `READ_ONLY`): `list_programs`, `get_program`, `get_program_progress`. Writes: `write_program`
(idempotent, destructive), `update_program` (idempotent, destructive), `delete_program` (destructive), `enroll_program`
(idempotent, not destructive), `set_enrollment_status` (idempotent, not destructive), `swap_exercise` (idempotent).
```ts
ListProgramsInput = Struct({});  ProgramList = Struct({ programs: Array(ProgramSummary) })   // built-ins first, then rows by title
GetProgramInput = Struct({ programId: ProgramId });  ProgramDetail = Struct({ program: Program, source: ProgramSource, version: Int, schedule: OptionFromNullOr(ProgramSchedule), enrollments: Array(EnrollmentSummary) })
ProgramItemInput = Union([ Struct({ kind: Literal("timed"), catalogId: CatalogId, seconds: Int 10..600, restSeconds: Int 0..300 }),
                           Struct({ kind: Literal("reps"), catalogId: CatalogId, reps: Int 1..100, restSeconds: Int 0..300 }) ])
ProgramDayInput = Struct({ title: Label, rounds: Int 1..5, items: Array(ProgramItemInput) 1..12, restBetweenRoundsSeconds: Int 0..300 })  // dayNumber = position
WriteProgramInput = Struct({ slug: Slug, title: Label, summary: Note, description: optionalKey(Text), schedule: ProgramSchedule, days: Array(ProgramDayInput) 1..60 })
WriteProgramResult = Struct({ programId: ProgramId, created: Boolean /* false = replaced by slug, same id */, version: Int, days: Int,
                              minutesPerDay: Struct({ min: Int, max: Int }), warnings: Array(String) })
UpdateProgramInput = Struct({ programId: ProgramId, ...UserProgramPatch.fields, days: optionalKey(Array(ProgramDayInput) 1..60) })  // {} besides programId → ValidationError "empty patch"
UpdateProgramResult = WriteProgramResult
DeleteProgramInput = Struct({ programId: ProgramId, force: optionalKey(Boolean) });  DeleteProgramResult = Struct({ deleted: Boolean, abandonedEnrollments: Int })
EnrollProgramInput = Struct({ programId: ProgramId, startedOn: optionalKey(LocalDate) })
EnrollmentSummary = Struct({ enrollmentId: ProgramEnrollmentId, programId: ProgramId, title: Label, status: EnrollmentStatus, startedOn: LocalDate,
                             currentDay: Int, totalDays: Int, completedDays: Int, lastCompletedAt: OptionFromNullOr(Timestamp), swaps: Swaps })
EnrollProgramResult = Struct({ enrollment: EnrollmentSummary, alreadyActive: Boolean })
GetProgramProgressInput = Struct({ programId: optionalKey(ProgramId) })
ProgramProgress = Struct({ enrollments: Array(EnrollmentSummary), completions: Array(Struct({ enrollmentId, dayNumber: DayNumber, completedAt: Timestamp, durationSeconds: Int })) }) // completions only when programId given, else []
SetEnrollmentStatusInput = Struct({ enrollmentId: ProgramEnrollmentId, status: Literals(["active", "paused", "abandoned"]) });  SetEnrollmentStatusResult = Struct({ enrollment: EnrollmentSummary })
SwapExerciseInput = Struct({ enrollmentId: ProgramEnrollmentId, from: CatalogId, to: OptionFromNullOr(CatalogId) /* null = revert */ });  SwapExerciseResult = Struct({ swaps: Swaps, candidates: Array(CatalogId) })
```
Semantics (`apps/worker/src/mcp/programTools.ts`): every check before the first write, every row carries the caller's
`userId`. `write_program`: decode → catalog check (`findCatalogExercise`, first unknown id → `NotFound { entity:
"catalogExercise", id }` (`EntityName` gains `"catalogExercise"` and `NotFound.id` is a plain `String`, ratified 16:11: catalog ids and built-in program ids are slugs, not UUIDs)) → `bySlug`: none → insert (`source: "mcp"`, `version: 1`, `created: true`); some → replace
fields, `version + 1`, same id, `created: false`. Warnings (strings, never errors): `"day N runs M min (> 45)"`,
`"day N repeats <id>"`, `"<id> is a timed exercise used as reps"` / vice versa (catalog `kind` vs item `kind`;
`kind: "distance"` entries never warn), `"enrollment <id> is on day K > days (N): the app shows the program as finished"`.
`update_program`: built-in `programId` → `Forbidden "built-in programs are read-only"`; unknown → `NotFound { entity:
"program" }`; applies the patch, `version + 1`, same warnings. `delete_program`: active/paused enrollments and no `force` →
`ValidationError "program has N active enrollments; pass force: true to abandon them and delete"`; with `force` → those
enrollments `abandoned`, row soft-deleted; built-in → `Forbidden`; already deleted → `deleted: false`. `enroll_program`:
existing live `active`/`paused` enrollment for the program → return it, `alreadyActive: true`; else a new row
(`startedOn` default = today in `profile.timezone` — `VERIFY:` the helper `get_overview` uses for "today", N-S2 names it;
`currentDay: 1`, `swaps: []`). `set_enrollment_status`: terminal statuses refuse (§1); `active → paused`, `paused →
active`, either → `abandoned`. `swap_exercise`: `from` must occur in the program's days (else `ValidationError`); `to` must
be in `swapCandidates(original, CATALOG, [] /* server has no location: equipment not filtered */)` else `ValidationError
listing the first 8 candidates`; `null` removes the entry; result echoes the 8 candidates for `from`.
Descriptions (verbatim in the tool; one paragraph each, ≤ 900 chars). `write_program`: "Create or replace one of the
user's guided programs (replace = same slug; the id and enrollments are kept). A program is 1–84 days; each day has
1–12 exercises done for 1–5 rounds. Use `search_exercises` to get `catalogId`s — never invent ids. Use `kind: "timed"`
(10–600 s) only for holds, isometrics and cardio (plank, wall sit, bike); use `kind: "reps"` (1–100) for everything
else. Rest 15–30 s between core/bodyweight items, 60–120 s between heavy strength items, 0 for cardio; 45–90 s between
rounds. Structure weeks as 7 days with 1–2 recovery/rest-style days (fewer items, 1 round); progress week over week by
adding reps/seconds or a round, not new exercises every day. Keep a day ≤ 45 min (the result reports min/max minutes).
Errors: ValidationError (field path + rule), NotFound catalogExercise (an id you made up), Forbidden (built-in slug)."
`enroll_program`: "Start the user's enrollment in a program today (or `startedOn`). Several programs may be active at
once; the app's Today lists each active program's next day. Returns the existing enrollment if one is already
active/paused." The others: one factual sentence + the errors above. Read-scope principals see the three reads only.

## 4. App (`apps/mobile`; Forge system; content width at 390 = 390 − 2·16 = 358)
Routes (add to `apps/mobile/CLAUDE.md` Layout; all `Page` + `AppBar`, phone single column, `wide` Columns 6/6 as the tab
has today; Loading/Failed/Empty states single-column on EVERY route below): `(tabs)/programs.tsx` (list), `programs/
[programId].tsx` (detail), `programs/new.tsx` (start: blank or duplicate), `programs/edit/[programId].tsx` (program
editor), `programs/edit/[programId]/day/[n].tsx` (day editor), `programs/pick.tsx` (exercise picker, modal), `programs/
play.tsx` (unchanged; `?enrollmentId=` REQUIRED now — `usePlayer` reads it; `VERIFY: grep -n "active" apps/mobile/src/
hooks/usePlayer.ts` for the current "first active" lookup to replace).
Programs tab: `AppBar title="Programs"` with trailing `IconButton icon="plus" accessibilityLabel="New program"` →
`/programs/new`. Sections (`SectionHeader` level 2): "Active" (every `active`/`paused` enrollment: `DayCard` per
program, as today, `paused` adds `StatusPill tone="muted" "Paused"`; tap Start → `/programs/play?enrollmentId=`),
"Programs" (`ListRow` per `ProgramSummary`: `icon="program"` (VERIFY iconPaths name; fallback `"calendar"`), `title`,
`subtitle` = `"${days} days · ${min}–${max} min"` + for `mcp` " · Made with Claude", `trailing` = `ToggleChip`-style
badge "Yours" (non-builtin, 56×24) and/or `StatusPill` "Active"/"Paused", `chevron`, `onPress` → detail). Row width:
16 + 24 icon + 12 + text 182 + 12 + badge 56 + 8 + pill 36?→ use ONE trailing slot ≤ 100 px: badge "Yours" OR status
pill (status wins) → text = 358 − 16 − 24 − 12 − 12 − 100 − 8 − 20 − 16 = 150 min, 2 lines; row height 22 + 20 + 2·8 + 2
= 60. Empty custom list → no empty state (built-ins always exist).
Detail: `EnrolCard` (button "Start program"; when another program is active: "Start alongside"), `ProgramInside`,
`DayList`; enrolled: `DayCard` + `DayStats` + `DayItems` (swaps applied) + actions group (`ListRow`s): "Pause"/"Resume"
(`icon="pause"/"play"`), "Leave program" (`tone="danger"`), and for non-builtin "Edit program" (`chevron`) and "Delete
program" (`tone="danger"`; disabled with subtitle "Leave the program first" while active/paused — pausing does not unblock it; inline confirm Banner, `Alert` is a no-op on web).
Built-ins: "Duplicate to edit" (`chevron`) → `/programs/new?from=`.
New: two `Card`s 358 wide: "Blank program" and "Duplicate a program" (`ListRow` per program) → creates a `program`
row (`source: "manual"`, `version 1`, slug = slugified title + 4 random chars) and opens the editor.
Program editor (`programs/edit/[programId]`): form rows at 358: Title (`TextInput` 48 h), Summary (`TextInput`
multiline 2 lines, 68 h), Schedule (`SegmentedControl` 3/4/5/6 days per week, 358×40, or weekdays `ToggleChip`s 7 × 44
= 308 + 6·8 = 356 ≤ 358), Days (`ListRow` per day: title, subtitle "N items · ≈ M min", `trailing` two `IconButton`
44×44 up/down (88 + 8 gap; text = 358 − 16 − 12 − 96 − 20 − 16 = 198), `chevron` → day editor; footer `Button
variant="secondary" "Add day"` duplicates the last day). Save: `Button` primary 358×52 in the footer; every change
writes the row (`version + 1`) through `UserProgramRepo.save` (mobile, `LocalStore` + dirty) — no draft state.
Day editor (`.../day/[n]`): Title, Rounds (`Stepper` 1–5), Rest between rounds (`Stepper` 0–300 step 15), Items (one
`Card` 358 each: line 1 exercise name (`Text variant="title"`) + `SegmentedControl` Timed/Reps 120×32; line 2 two
`Stepper`s (358 − 2·16 − 12)/2 = 157 each: value (timed 10–600 step 5 / reps 1–100 step 1), rest 0–300 step 5; line 3
`IconButton`s up / down / remove (3 × 44 + 2·8 = 148, right-aligned); card height 16 + 32 + 12 + 44 + 12 + 44 + 16 =
176). "Add exercise" → `/programs/pick` (search field + `ListRow`s from `CATALOG` filtered by the active location,
`useCatalogSearch` if present — `VERIFY: grep -rn "searchCatalog\|useLibrary" apps/mobile/src`), returns via
`router.back()` after writing the item (store param `pickFor=<programId>/<day>`). Reorder is up/down, not drag (RN web).
Swap in the player: each exercise screen gets `IconButton icon="swap"` (VERIFY name; fallback "refresh") in the
header → `BottomSheet`-like `Page` modal `/programs/swap?enrollmentId=&from=` listing `swapCandidates(original,
CATALOG, activeLocationEquipment)` as `ListRow`s (title, subtitle = shared muscles · equipment) + "Revert to original"
row when swapped. Choosing writes `ProgramRepo.setSwap(enrollmentId, from, Option<to>)` (patch `swaps`, dirty, push)
and the player re-reads `applySwaps(day, swaps)` for the rest of the session (the running item keeps its clock).
Today: new section "Programs due" above the planned session: one `ListRow` per active enrollment whose `currentDay` has
no completion today (`title` program, `subtitle` "Day N · ≈ M min", `trailing` `Button size="sm" "Start"`, 358 row,
60 h); none → section hidden. Reads `ProgramRepo.dueToday(now)`.
Mobile services (`ProgramRepo.ts`): `find` becomes `(id) => Effect<Option<Program>, StoreError>` over built-ins then the
`program` rows (`layerWith(find)` signature change; `layerNoDeps` builds it from `LocalStore`); add `list():
Effect<ReadonlyArray<ProgramSummary>>`, `activeEnrollments()`, `dueToday(now)`, `setStatus(enrollmentId, status)`,
`setSwap(...)`, `save(row)`, `deleteProgram(id)` (refuses while enrolled: `ProgramInUse` internal error). `useProgramDay`
becomes `usePrograms` (`Loading | Failed | Ready { summaries, active: ReadonlyArray<{enrollment, program, day}> }`).

## 5. End-to-end recipe (QA, P-Q)
1. Claude app (connector, write scope): `search_exercises "plank"` → `write_program { slug: "mobility-20", title: "20-Day
   Mobility", summary, schedule: { kind: "weekdays", weekdays: [mon..sat] }, days: 20 × { title, rounds 1, items 6 timed 40 s
   rest 15, restBetweenRoundsSeconds 0 } }` → result `created: true`, `minutesPerDay` ≈ 5–6, `warnings: []`.
2. `list_programs` shows 3 (Core 30, 12-Week Lean Build, 20-Day Mobility `source: mcp`). `enroll_program` → `currentDay: 1`.
3. App (web 390, signed in): pull → Programs tab shows "Active · 20-Day Mobility · Day 1" and the row with "Yours · Made
   with Claude"; Today shows "Programs due: 20-Day Mobility, Day 1". Start → player runs day 1; Swap on item 2 lists
   candidates; pick one → the item shows the new name; complete the day → `get_program_progress` shows `completedDays: 1`,
   `swaps: [{from, to}]`.
4. `set_enrollment_status paused` → tab shows "Paused"; Today hides it. `update_program` title → tab re-renders after pull.
5. Detail → Pause → Leave; `delete_program` → `deleted: true`; the row disappears after pull.

## 6. Assumes (grep-verified 2026-10-27 14:36–14:41)
- `Slug` = `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` ≤ 64 (`catalog/taxonomy.ts`): a lowercase UUID is a valid `ProgramId`.
- `ProgramDay.items` ≤ 12, `rounds` 1–5 (`programs/Program.ts`); `ExerciseKind = reps | timed | distance`,
  `CatalogExerciseFields.primaryMuscles/secondaryMuscles/equipment` (`catalog/CatalogExercise.ts`); `isAvailableWith`,
  `activeLocation` (`catalog/availability.ts`).
- `ProgramRepo.layerWith(findProgram)` / `layerNoDeps` (`apps/mobile/src/services/ProgramRepo.ts`); `abandon` sets
  `"abandoned"`, `complete` sets `completed` past the last day (same file, lines found by `grep -n "abandoned\|completed"`).
- `useProgramDay` tags `Loading | Failed | NotEnrolled | Ready`, default `CORE30` (`src/player/useProgramDay.ts`).
- `ANNOTATIONS` exhaustive over `McpToolName`, `toolsFor` composes `readTools`/`writeTools` (`apps/worker/src/mcp/server.ts`).
- `gutter.phone = 16` (`ui/tokens.ts`); primitives present: `ListRow` (props `title, subtitle, icon, trailing, chevron,
  tone, disabled, onPress, titleVariant`), `Stepper`, `SegmentedControl`, `ToggleChip`, `StatusPill`, `IconButton`, `Card`,
  `Button`, `Banner`, `EmptyState` (`ls apps/mobile/src/ui`). `TextInput` is RN's.
- Nutrition lands migration 0008 and mobile v5, `MCP_TOOLS` 13 names, `tools/list` asserted 13 in N-S3 (`docs/tasks/v6-nutrition.md`).

## 7. Second built-in: "12-Week Lean Build" (`packages/shared/src/programs/leanBuild.ts`, `programId: "lean-build-12"`)
Neutral name, no author or trademark anywhere (code, copy, docs). Generated like `core30.ts` from templates; 84 days,
`PROGRAMS = [CORE30, LEAN_BUILD_12]`. Every id below exists in `packages/shared/src/catalog/data/*.ts` (verified
2026-10-27 14:42 against the `catalogId:` greps of chest/back/legs/shoulders/arms/hips/cardio/core); the test asserts
`findCatalogExercise` is `Some` for every item, `days.length === 84`, every day `dayDurationSeconds` within 10–40 min,
and `(d % 7 === 0) → rounds 1`.
Week slot = `(day − 1) % 7`: 0 Push · 1 Pull · 2 Cardio A · 3 Legs · 4 Upper · 5 Cardio B · 6 Recovery. Block = weeks 1–4 /
5–8 / 9–12. Title: `Day ${d} · Week ${w} · ${slot}`. `tagline`: "Push, pull, legs and cardio — six days a week for twelve
weeks." `description`: 2 sentences, says loads go up each block while reps go down.
| Block | main reps | accessory reps | rest s (main / accessory) | rounds | round rest | cardio main s |
|---|---|---|---|---|---|---|
| 1 (w1–4) | 12 | 15 | 60 / 45 | 3 | 90 | 900 |
| 2 (w5–8) | 10 | 12 | 75 / 45 | 3 | 90 | 1200 |
| 3 (w9–12) | 8 | 12 | 90 / 60 | 3 | 90 | 1500 |
Strength days (all `kind: "reps"`; `M` = main, `A` = accessory):
- Push: barbell-bench-press M, incline-dumbbell-press M, machine-shoulder-press M, cable-fly A, dumbbell-lateral-raise A,
  triceps-pushdown A, cable-overhead-triceps-extension A.
- Pull: lat-pulldown M, seated-cable-row M, one-arm-dumbbell-row M, face-pull A, dumbbell-rear-delt-fly A, ez-bar-curl A,
  hammer-curl A.
- Legs: barbell-back-squat M, romanian-deadlift M, leg-press M, lying-leg-curl A, leg-extension A, hip-thrust M,
  standing-calf-raise A.
- Upper: machine-chest-press M, chest-supported-row-machine M, dumbbell-shoulder-press M, close-grip-lat-pulldown M,
  dumbbell-curl A, rope-triceps-pushdown A.
Cardio days (rounds 1, `restBetweenRoundsSeconds` 0; `kind: "timed"` unless noted):
- Cardio A: incline-treadmill-walk 300 s rest 0 · stationary-bike <cardio main s> rest 60 · plank 45 s rest 15 ·
  side-plank 30 s rest 0.
- Cardio B: elliptical-trainer 300 s rest 0 · treadmill-interval-run <cardio main s> rest 60 · dead-bug reps 12 rest 15 ·
  hollow-hold 30 s rest 0.
Recovery (slot 6, rounds 1, round rest 0): bird-dog reps 10 rest 15 · glute-bridge reps 12 rest 15 · superman-hold 30 s
rest 15 · dead-bug reps 10 rest 0 (≈ 2.5 min).
Duration check: block 1 push = 3 × (3·(24+60) + 4·(30+45) − 45) + 2·90 = 3 × 507 + 180 = 1701 s ≈ 28 min; block 3 push =
3 × (3·(16+90) + 4·(24+60) − 60) + 180 = 3 × 594 + 180 = 1962 s ≈ 33 min; cardio A block 3 = 300 + 1500 + 60 + 45 + 15 + 30 =
1950 s ≈ 33 min. Built-in `Seconds` allows up to 3600 (custom programs cap at 600 via `ProgramItemInput`, §3).
