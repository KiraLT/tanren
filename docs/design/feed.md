# Activity feed — design (ADR-0017, plan Amendment 8)

Normative for v4-feed. Forge (`ui-direction-final.md`, ADR-0014) and the desktop column rules
(`ui-desktop.md`) apply unchanged; this doc adds one shared module, one repo, two screens and a
navigation change. Facts cited from the code as of 2026-10-26 21:14 (commit 070194b).

## 1. The aggregate: `packages/shared/src/activity.ts` (+ `activity.test.ts`, exported from `index.ts`)

Schemas reuse: `SessionId`, `ExerciseId`, `SetId` (ids.ts); `Label`, `Timestamp`, `WeightKg`,
`Reps`, `Rpe` (common.ts); `MuscleGroup` (exercise.ts); `CatalogId` (catalog); `ProgramId`,
`DayNumber` (programs/Program.ts). `Schema.Int` as in mcp.ts.

```ts
export const ActivityKind = Schema.Literals(["planned", "program", "free"])
export const ActivityStatus = Schema.Literals(["done", "inProgress"])

export const ActivitySet = Schema.Struct({
  setId: SetId,
  weightKg: WeightKg,
  reps: Reps,
  rpe: Schema.OptionFromNullOr(Rpe),
  loggedAt: Timestamp,
  /** PR over the exercise's full history at that moment (`markPrs`). */
  isPr: Schema.Boolean,
})

export const ActivityExercise = Schema.Struct({
  exerciseId: ExerciseId,
  name: Label,
  catalogId: Schema.OptionFromNullOr(CatalogId),
  /** Chronological (`Chronological` order). Never empty. */
  sets: Schema.Array(ActivitySet),
  /** `bestSet` of `sets`: weightKg, reps. */
  best: Schema.Struct({ weightKg: WeightKg, reps: Reps }),
  prs: Schema.Int,
})

export const Activity = Schema.Struct({
  sessionId: SessionId,
  kind: ActivityKind,
  status: ActivityStatus,
  /** Planned session name | `${program.name} · Day ${n}` | "Workout". */
  title: Label,
  startedAt: Timestamp,
  /** `finishedAt − startedAt` if finished; else last − first `loggedAt` when ≥ 2 sets; else None. */
  durationSeconds: Schema.OptionFromNullOr(Schema.Int),
  sets: Schema.Int,
  reps: Schema.Int,
  /** Σ weightKg · reps. */
  volumeKg: Schema.Number,
  prs: Schema.Int,
  program: Schema.OptionFromNullOr(Schema.Struct({ programId: ProgramId, dayNumber: DayNumber })),
  /** In order of each exercise's first set. */
  exercises: Schema.Array(ActivityExercise),
  /** Union over `exercises` of the catalog entry's `primaryMuscles` / `secondaryMuscles`
   *  (`findCatalogExercise`), a muscle never in both; an exercise without `catalogId` contributes
   *  its `muscleGroups` as primary. Each list sorted by `MuscleGroup` literal order. */
  muscles: Schema.Struct({ primary: Schema.Array(MuscleGroup), secondary: Schema.Array(MuscleGroup) }),
})
export type Activity = typeof Activity.Type

export const ACTIVITY_OPEN_WINDOW_MS = 12 * 60 * 60 * 1000

export interface BuildActivityInput {
  readonly session: Session
  /** This session's live sets with full-history PR flags, any order. */
  readonly sets: ReadonlyArray<WorkoutSet & { readonly isPr: boolean }>
  readonly exercises: ReadonlyMap<string, Exercise>          // by exerciseId
  readonly plannedTitle: Option.Option<Label>                // live planned session's name
  readonly program: Option.Option<{ readonly programId: ProgramId; readonly dayNumber: DayNumber }>
  readonly now: DateTime.Utc
}
/** Pure. Returns None when `sets` is empty (not an activity). A set whose exercise is missing from
 *  `exercises` is kept under name "Unknown exercise" with no catalogId (never dropped: counts stay true). */
export const buildActivity: (input: BuildActivityInput) => Option.Option<Activity>
```
Rules: `kind` = `program` when `program` is Some, else `planned` when `plannedTitle` is Some, else
`free`. `title` for `program` = `findProgram(programId).name` + " · Day n" (unknown id → "Program ·
Day n"). `status` = `inProgress` iff `finishedAt` is None and `now − startedAt < ACTIVITY_OPEN_WINDOW_MS`.
`durationSeconds` floors to whole seconds. PR math moves here verbatim from
`apps/mobile/src/services/progressMath.ts`: `ScoredSet`, `epley1Rm`, `SetScore`, `Chronological`,
`bestSet`, `markPrs` (progressMath.ts:4–66) with their tests; `progressMath.ts` keeps `shiftDate`,
`weekStartOf` and re-exports the moved names so no app import changes.

Tests (`activity.test.ts`): empty sets → None; title precedence (program > planned > free);
duration from `finishedAt`, from two sets, None for one set; `inProgress` at 11 h 59 m, `done` at
12 h and when finished; muscles union with a secondary that is primary elsewhere ends up primary
only; exercise order by first set; `Activity` round-trips `encode ∘ decode`.

## 2. Store query: `apps/mobile/src/services/FeedRepo.ts` (+ test), wired in `runtime.ts`

```ts
export interface FeedRepoShape {
  /** Live sessions with ≥ 1 live set, `startedAt` desc then id desc. The UI pages by FEED_PAGE. */
  readonly activities: (limit: number) => Effect.Effect<ReadonlyArray<Activity>, StoreError>
  /** None when the session is missing, deleted or has no live set. */
  readonly activity: (id: SessionId) => Effect.Effect<Option.Option<Activity>, StoreError>
}
export const FEED_PAGE = 20
export class FeedRepo extends Context.Service<FeedRepo, FeedRepoShape>()("@tanren/FeedRepo") {
  static readonly layer: Layer.Layer<FeedRepo, never, LocalStore>
}
```
SQL (same style as HistoryRepo.ts:220–305, `LocalStore.all`, `decodeRecords(SessionRow)` etc.):
1. Page: `SELECT ws.* FROM "workout_session" ws WHERE ws."deletedAt" IS NULL AND EXISTS (SELECT 1
   FROM "workout_set" s WHERE s."sessionId" = ws."id" AND s."deletedAt" IS NULL) ORDER BY
   ws."startedAt" DESC, ws."id" DESC LIMIT ?`.
2. History for PR flags: HistoryRepo's `liveSets` with the `exerciseId IN (SELECT "exerciseId" FROM
   "workout_set" WHERE "deletedAt" IS NULL AND "sessionId" IN (…))` filter (HistoryRepo.ts:286–292),
   then `markPrs` per exercise (HistoryRepo `markByExercise`, :117–122); keep only the page's sets.
3. `exercise` rows by id (deleted ones included: a deleted exercise still names old sets), `planned_session`
   live rows by id → titles, `program_day_completion` live rows `WHERE "sessionId" IN (…)` → program.
4. `DateTime.now` → `buildActivity` per session; `Option.toArray`.
`activity(id)` is the same pipeline for one id. Hooks `apps/mobile/src/hooks/useFeed.ts`:
`useFeed(limit)` and `useActivity(id)` on the `useHistoryRead` pattern (hooks/useHistory.ts:94–100),
state type `HistoryState<…>` re-exported; both refresh on `StoreEvents` like Progress does
(VERIFY: how `useHistoryRead` subscribes; copy it).

## 3. Phone composition at 390 (gutter 16 → content 358; Card padding 16 → inner 326; VERIFY `Card` default padding = `space.lg`)

Screen `app/(tabs)/feed.tsx`: `AppBar title="Feed"`, `trailing` = two `IconButton`s `chart`
(→ `/progress`, label "Progress") and `settings` (→ `/settings`, label "Settings"), 44 + 8 + 44 =
96 px ≤ the trailing slot (VERIFY: AppBar trailing slot width ≥ 96). Body: `FlatList` of sections.

Week header row (`src/components/feed/feedGroups.ts`): `title2` "This week" / "Last week" / "Week of
13 Oct" (`weekStartOf`, progressMath.ts:76; week start = that function's, do not assume Monday)
left, `caption` muted "3 workouts · 12,400 kg" right; 358 wide, height 36, `marginTop: space.xl`.

`ActivityCard` (`src/components/feed/ActivityCard.tsx`, `Card onPress`, `accessibilityLabel` = §6):
| row | slots (left → right) | arithmetic at inner 326 |
| --- | --- | --- |
| head | text column: `headline` title (1 line, ellipsis) + `caption` muted "Sat 26 Oct · 18:40" | map slot `MuscleMap size=56 view="both"` right | 326 − 56 − 12 = 258 text ✓ (VERIFY `size` is the height; if width, use 56 too) |
| stats | 3 tiles flex 1: `numeral`-styled `title2` value + `label` muted caption: "48 min" / "4,230 kg" / "18 sets" ; second caption line "Duration" / "Volume" / "6 exercises" | (326 − 2·12) / 3 = 100.67 ≥ 96 ("4,230 kg" at 22 px ≈ 84) ✓ |
| strip | up to 4 `MuscleMapImage size=48` (catalogId, primary, secondary from the exercise's catalog entry; exercises without catalogId draw `MuscleMap size=48`) + 1 overflow disc "+2" (48, `surfaceRaised`, `caption`) | 5 · 48 + 4 · 8 = 272 ≤ 326 ✓ |
| pills | `StatusPill` "PR ×2" `tone="accent" icon="flame"` · `StatusPill` "Core-30 · Day 12" `tone="neutral" icon="grid"` · `StatusPill` "In progress" `tone="accent" icon="zap"` ; row only when ≥ 1 pill; wrap | 2 pills ≤ 140 each: 140 + 8 + 140 = 288 ≤ 326 ✓ |
Rows separated by `space.md` 12. Hidden when absent: duration tile shows "—" with caption
"Duration"; volume tile shows reps ("124 reps", caption "Reps") when `volumeKg === 0`. Cards 12 apart.
Press: `status === "inProgress"` → `router.navigate("/today")`, else
`router.navigate({ pathname: "/activity/[sessionId]", params: { sessionId } })`.

End of list: `Button variant="secondary"` "Load more" (56) when `items.length === limit`; the
hook's `limit` grows by `FEED_PAGE` (Progress pattern, progress.tsx:92).

## 4. Detail: `src/components/feed/ActivityDetail.tsx`, route `app/activity/[sessionId].tsx`

`ActivityDetail({ activity, layout: "stacked" | "split" })`. Stacked (phone, 358):
1. Head: `title` text (`display` face) + `caption` "Sat 26 Oct · 18:40 – 19:28" (end only when
   `durationSeconds` is Some) + pills row as §3.
2. `MuscleMap size=176 view="both"` centred, `accessibilityLabel` "Muscles worked: chest, triceps;
   secondary: shoulders" (VERIFY: MuscleMap's own label prop; else wrap in an accessible View).
3. Stat tiles: 2 × 2 grid of `Card`s 173 wide (358 − 12) / 2 = 173 ✓: Duration, Volume (or Reps),
   Sets, PRs; `title2` value, `label` caption.
4. "Exercises" `ListGroup`: one `ListRow` per `ActivityExercise`, `leading` = `MuscleMapImage
   size=56`, `title` name, `subtitle` "3 sets · best 87.5 kg × 8", `trailing` `StatusPill "PR"` when
   `prs > 0`, `chevron`, press → `/progress/[exerciseId]`; under each row a `caption` line of its
   sets "80 × 8 · 85 × 8 · 87.5 × 8 PR · RPE 8" (`formatSetText`, progressFormat.ts:48), padded 16
   + 56 + 12 = 84 from the left to align with the title. Row 56 + 12 + text ≤ 358 ✓.
Route: `AppBar title={activity.title} leading={<IconButton icon="chevronLeft" … />}`; missing id →
`EmptyState icon="warning" title="Activity not found" body="It may have been deleted on another device."`

## 5. Desktop (ui-desktop §1, §3)

| screen | Page | main | side |
| --- | --- | --- | --- |
| Feed `(tabs)/feed` | `aside`, `5/7` → 464 / 648 (inner 400 / 584) | week headers + cards at 400 inner (card inner 368: head 368 − 68 = 300 text ✓, strip 272 ✓, tiles (368 − 24)/3 = 114 ✓) | `ActivityDetail layout="split"` for the selected card (`selected` prop; default newest, Progress's `effectiveSelection` pattern progress.tsx:76); press on a card selects instead of navigating |
| Detail `activity/[sessionId]` | `wide` (inner 1072) | `Columns 7/5`: main 611 = head + stat tiles (4 in a row: (611 − 36)/4 = 143 ✓) + Exercises group | side 437 = `MuscleMap 176` + pills |
Split arithmetic: 464 + 24 + 648 = 1136 ✓; 611 + 24 + 437 = 1072 ✓. At 900 the 5-share column is
364 (inner 300): card head 300 − 68 = 232 ✓, strip 272 ≤ 300 ✓, tiles (300 − 24)/3 = 92 (keep
`title2` 22 px; "4,230 kg" ≈ 84 ✓).

## 6. States, copy, accessibility

- Loading: 3 `Skeleton width="100%" height=196 radius=radius.lg` under a 36 header skeleton,
  wrapper `accessible accessibilityLabel="Loading feed"`.
- Empty: `EmptyState icon="flame" title="No workouts yet" body="Log a set on Today or finish a
  program day and it shows up here." action={{ label: "Go to Today" }}`.
- Failed: `EmptyState icon="warning" title="Could not load the feed" body={message}`.
- Card label: `"${title}, ${date} ${time}, ${duration ?? "duration unknown"}, ${sets} sets, ${exercises}
  exercises, ${volume}" + (prs ? `, ${prs} personal records` : "") + (program ? `, ${program title}` : "")`,
  `accessibilityRole="button"`. Week header `accessibilityRole="header"`.
- Date/time: `formatLoggedDate` (progressFormat.ts:56) + local `HH:mm` (new `formatClock` in
  `feedGroups.ts`); duration "48 min" / "1 h 12 min" (`formatDuration`, also in `feedGroups.ts`).
- Numbers: `formatVolume` (progressFormat.ts:52), `formatKg1` for best sets.
- Tab: `APP_NAV[0] = { name: "feed", href: "/feed", label: "Feed", icon: "flame" }` (icon exists,
  iconPaths.ts:47); Progress entry removed; `isActivePath` unchanged.

## 7. Not in this step
Location chip (ADR-0017 §Not decided), MCP exposure, images/photos on cards, comments/kudos.
