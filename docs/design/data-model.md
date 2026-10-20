# Data model and sync envelope — `@tanren/shared`

Date: 2026-10-19 · Author: architect (S1-A) · Step: 1 · Status: design for
implementation (field-level; engineers implement it without inventing shapes).

Targets **Effect 4.0.5** (the Lead switched the project from 3.x to 4.0.5
during this design; ADR-0004 pins `effect@4.0.5`, `@effect/vitest@4.0.5` and
`vitest@5.0.5` exactly, ADR-0003 pins TypeScript 7.0.2; background in
`docs/research/2026-10-19-toolchain-versions.md` §D).
API names below were checked against the `effect@4.0.5` tarball
(`src/Schema.ts`, `src/Match.ts`, `src/DateTime.ts`, `src/SchemaIssue.ts`,
`src/Struct.ts`, `src/http-api/HttpApiError.ts`) and against
`docs/research/2026-10-19-effect-4-api.md` and
`docs/research/2026-10-19-effect4-schema-details.md`. Items marked *confirm at runtime*
in §12 get a test in the task that owns them; when this document and the
installed `node_modules/effect/src/*.ts` disagree, the source wins (report it).

Constraints this design does not relax: `docs/plan.md` (entities, hard rules,
offline-first LWW sync), `CLAUDE.md`, `packages/shared/CLAUDE.md` boundaries
(runtime dependency `effect` only; pure; one file per aggregate).

---

## 1. Entity overview

| Entity (plan) | TS schema | ID brand | `SyncTable` literal | D1 table (step 2, suggestion) | Parent | Synced | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| user | `User` | `UserId` | — | Better Auth `user` | — | no | projection of the auth user; read-only for clients |
| profile | `Profile` | `UserId` (id = userId) | `profile` | `profile` (PK `user_id`) | user | yes | exactly one per user |
| exercise | `Exercise` | `ExerciseId` | `exercise` | `exercise` | user | yes | owner-defined names; Claude maps via aliases |
| plan | `Plan` | `PlanId` | `plan` | `plan` | user | yes | at most one `active` per user |
| planWeek | `PlanWeek` | `PlanWeekId` | `planWeek` | `plan_week` | plan | yes | keyed by `weekStart` within a plan |
| plannedSession | `PlannedSession` | `PlannedSessionId` | `plannedSession` | `planned_session` | planWeek | yes | ordered within the week |
| plannedSet | `PlannedSet` | `PlannedSetId` | `plannedSet` | `planned_set` | plannedSession | yes | references an exercise |
| session | `Session` | `SessionId` | `session` | `workout_session` | user (opt. plannedSession) | yes | a logged workout |
| set | `WorkoutSet` | `SetId` | `set` | `workout_set` | session | yes | a logged set; references an exercise |

Why `WorkoutSet` and not `Set`: `Set` shadows the global `Set` constructor in
every module that imports it. The ID stays `SetId` (fixed by the brief), the
wire/table literal stays `set`. Why `workout_session` / `workout_set` in D1:
Better Auth owns a `session` table and `set` is an SQL keyword.

Every synced entity carries the **row columns** (§7.0): `id`, `userId`,
`createdAt`, `updatedAt`, `deletedAt`. Soft deletes only; sync is
last-write-wins on `updatedAt` (§10).

---

## 2. Representation decisions

**IDs.** UUID strings, branded per entity:
`Schema.String.check(Schema.isUUID()).pipe(Schema.brand("SetId"))`. Any UUID
version is accepted on decode (`isUUID()` without a version argument). New ids
come from the `IdGenerator` service in `ids.ts` (§4.2): `IdGenerator.layer`
wraps `crypto.randomUUID()` (Workers, Hermes, browsers), `IdGenerator.layerTest`
yields a fixed sequence; no schema has a default id. Never pass raw strings
between layers. `Uuid` (unbranded) exists for places
that carry an id of a table chosen at runtime (sync accepted/rejected lists,
`NotFound.id`).

**Timestamps: `DateTime.Utc` in TypeScript, ISO-8601 UTC string on the wire.**
Schema: `Schema.DateTimeUtcFromString` (decodes any string `DateTime.make`
accepts, encodes a UTC ISO string via `DateTime.formatIso`, i.e.
`YYYY-MM-DDTHH:mm:ss.sssZ`, fixed 24 characters, millisecond precision).
Decoding is lenient: zone-less strings are read as UTC and offsets are
normalised to `Z`; the server re-encodes before storing, so stored strings are
always canonical. Non-ISO inputs parse engine-dependently and are not
supported (clients always send the canonical form; a strict ISO-only variant
is listed in §12 for later if needed).
Justification: `DateTime.Utc` is immutable, has `Equal` and `Order`
(`DateTime.Order`, `DateTime.isGreaterThan`) which the LWW comparison needs,
formats deterministically, and is what `Clock`/`DateTime.now` produce, so
services never touch `Date`. `Date` is mutable, has no structural equality,
and invites timezone bugs in React code. Because both server and clients
encode through the same schema, the encoded strings compare chronologically
as plain strings too; step 2 may therefore store `TEXT` and compare in SQL.

**Calendar dates (`LocalDate`).** `weekStart`, `startDate`, `scheduledDate`
are dates without time, in the owner's local calendar. Representation: a
branded `YYYY-MM-DD` string (`Schema.String.check(isPattern, validCalendarDate)`
+ brand). Not a `Date`/`DateTime`: a midnight instant shifts by a day across
timezones; a string does not.

**Nullability.** `Option` in TypeScript, `null` on the wire:
`Schema.OptionFromNullOr(X)` for every optional row field and protocol field.
No `undefined` in row types. Patch inputs are the one place keys may be
absent (`Schema.optionalKey`), meaning "do not change".

**Collections.** `ReadonlyArray` via `Schema.Array`; sets of literals are
`Schema.UniqueArray` (JSON array on the wire, uniqueness checked). No
`HashSet`/`Set` in domain types: they do not serialise and are awkward in
React.

**Literal values** are camelCase strings (`lowerBack`, `planWeek`,
`fatLoss`): they are TypeScript identifiers, table names and MCP vocabulary at
once. Enums are `Schema.Literals([...])`; types are `typeof X.Type`.

**Classes vs structs.** Entities are `Schema.Class` (nominal type,
constructor, `.fields`); value objects (`Goal`, `Equipment`, `RepTarget`,
`ValidationIssue`) and protocol messages are `Schema.Struct`. Class
identifiers are `"@tanren/shared/<Name>"` (`"@tanren/shared/WorkoutSet"`), as
in the effect-conventions skill.

**Numbers.** Units are branded (`WeightKg`, `Reps`, `Rpe`) so weight and reps
cannot be swapped. Counters and positions (`OrderIndex`, `RestSeconds`,
`PageLimit`) are refined but unbranded.

**Strings** are stored trimmed; schemas *check* trimmedness
(`Schema.Trimmed`) rather than transform, so encode and decode are symmetric.
UI and MCP handlers trim before constructing.

---

## 3. Module map (`packages/shared/src/`, dependency order)

| File | Exports | Imports from |
| --- | --- | --- |
| `ids.ts` | `Uuid`, `UserId`, `ExerciseId`, `PlanId`, `PlanWeekId`, `PlannedSessionId`, `PlannedSetId`, `SessionId`, `SetId` (+ types); `IdGenerator` service (+ `IdGeneratorShape`, `newId`) | — |
| `common.ts` | `Timestamp`, `LocalDate`, `Label`, `Note`, `Text`, `Email`, `TimeZone`, `WeightKg`, `Reps`, `Rpe`, `OrderIndex`, `RestSeconds`, `PageLimit`, `Weekday`, `EntityName`, `SyncTable`, `rowFields` | `ids` |
| `user.ts` | `User`, `GoalKind`, `Goal`, `EquipmentKind`, `Equipment`, `ProfileFields`, `Profile`, `ProfileInsert`, `ProfilePatch` | `ids`, `common` |
| `exercise.ts` | `MuscleGroup`, `ExerciseFields`, `Exercise`, `ExerciseInsert`, `ExercisePatch` | `ids`, `common` |
| `plan.ts` | `PlanStatus`, `RepTarget`, `PlanFields`, `Plan`, `PlanInsert`, `PlanPatch`, `PlanWeekFields`, `PlanWeek`, …, `PlannedSessionFields`, `PlannedSession`, …, `PlannedSetFields`, `PlannedSet`, `PlannedSetInsert`, `PlannedSetPatch` | `ids`, `common` |
| `session.ts` | `SessionFields`, `Session`, `SessionInsert`, `SessionPatch`, `WorkoutSetFields`, `WorkoutSet`, `WorkoutSetInsert`, `WorkoutSetPatch` | `ids`, `common` |
| `errors.ts` | `ValidationIssue`, `NotFound`, `Forbidden`, `ValidationError`, `SyncConflict` | `ids`, `common` |
| `sync.ts` | `SyncChange`, `SyncCursor`, `RejectReason`, `AcceptedChange`, `RejectedChange`, `PushRequest`, `PushResponse`, `PullRequest`, `PullResponse`, `SYNC_TABLE_ORDER`, `MAX_PUSH_CHANGES` | all entity modules, `common` |
| `index.ts` | `export * from` each module above | — |

Each schema `X` is exported next to `export type X = typeof X.Type`; entities
and protocol messages also export `XEncoded = typeof X["Encoded"]`.
One import line in every module: `import { DateTime, Option, Schema, Struct } from "effect"`
(plus `Match`, `SchemaIssue` where used). Biome's `noShadowRestrictedNames`
rejects `Array`/`String` as local names: import them as `Array as Arr`,
`String as Str` when needed.

---

## 4. Common vocabulary (`common.ts`, plus `ids.ts`)

| Schema | TS type | Wire | Constraints / construction |
| --- | --- | --- | --- |
| `Uuid` | `string` | string | `Schema.String.check(Schema.isUUID())` |
| `<Entity>Id` | `string & Brand<"…Id">` | string | `Uuid.pipe(Schema.brand("…Id"))`; one helper `uuidBrand(name)` in `ids.ts` |
| `Timestamp` | `DateTime.Utc` | `"2026-10-19T17:02:11.000Z"` | `Schema.DateTimeUtcFromString`; decode rejects unparsable strings |
| `LocalDate` | `string & Brand<"LocalDate">` | `"2026-10-20"` | `isPattern(/^\d{4}-\d{2}-\d{2}$/)` + `makeFilter(isValidCalendarDate)` (§4.1) + brand |
| `Label` | `string` | string | `Schema.Trimmed.check(isMinLength(1), isMaxLength(80))` — names, titles |
| `Note` | `string` | string | `Schema.Trimmed.check(isMinLength(1), isMaxLength(500))` — one-liners |
| `Text` | `string` | string | `Schema.Trimmed.check(isMinLength(1), isMaxLength(4000))` — free text |
| `Email` | `string & Brand<"Email">` | string | `Trimmed.check(isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/), isMaxLength(254))` + brand |
| `TimeZone` | `string & Brand<"TimeZone">` | `"Europe/Berlin"` | `Trimmed.check(isPattern(/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/), isMaxLength(64))` + brand; IANA validity is not checked (Hermes/ICU risk) |
| `WeightKg` | `number & Brand<"WeightKg">` | number | `Number.check(isGreaterThanOrEqualTo(0), isLessThanOrEqualTo(1000), isMultipleOf(0.25))` + brand; `0` = bodyweight |
| `Reps` | `number & Brand<"Reps">` | integer | `Number.check(isInt(), isBetween({ minimum: 0, maximum: 1000 }))` + brand |
| `Rpe` | `number & Brand<"Rpe">` | number | `Number.check(isBetween({ minimum: 1, maximum: 10 }), isMultipleOf(0.5))` + brand |
| `OrderIndex` | `number` | integer | `Number.check(isInt(), isGreaterThanOrEqualTo(0))`; 0-based position within the parent (§11.2) |
| `RestSeconds` | `number` | integer | `Number.check(isInt(), isBetween({ minimum: 0, maximum: 3600 }))` |
| `PageLimit` | `number` | integer | `Number.check(isInt(), isBetween({ minimum: 1, maximum: 500 }))` |
| `Weekday` | `"mon" \| "tue" \| "wed" \| "thu" \| "fri" \| "sat" \| "sun"` | string | `Schema.Literals([...])` in that order |
| `EntityName` | literal union | string | `Schema.Literals(["user","profile","exercise","plan","planWeek","plannedSession","plannedSet","session","set"])` |
| `SyncTable` | `EntityName` minus `"user"` | string | `EntityName.pick(["profile","exercise","plan","planWeek","plannedSession","plannedSet","session","set"])` |
| `rowFields(id)` | fields object | — | §7.0 |
| `ROW_COLUMNS` | `readonly ["id", "userId", "createdAt", "updatedAt", "deletedAt"]` | — | the keys `Insert`/`Patch` omit (§7) |

`isMultipleOf(0.25)` and `isMultipleOf(0.5)` are exact in binary floating
point (dyadic fractions), so `62.75` passes and `100.1` fails
deterministically. Tests must cover both.

### 4.1 `isValidCalendarDate` (pure, in `common.ts`)

```ts
const daysInMonth = (year: number, month: number): number =>
  month === 2
    ? (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28
    : [4, 6, 9, 11].includes(month) ? 30 : 31

const isValidCalendarDate = (s: string): boolean => {
  const year = Number(s.slice(0, 4))
  const month = Number(s.slice(5, 7))
  const day = Number(s.slice(8, 10))
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
}
// LocalDate = Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/),
//   Schema.makeFilter(isValidCalendarDate, { expected: "a valid calendar date (YYYY-MM-DD)" }))
//   .pipe(Schema.brand("LocalDate"))
```

### 4.2 `IdGenerator` (ids.ts) — the only impure thing in `shared`, behind a service

```ts
import { Context, Effect, Layer, Schema } from "effect"

export interface IdGeneratorShape {
  readonly next: Effect.Effect<Uuid>
}
export class IdGenerator extends Context.Service<IdGenerator, IdGeneratorShape>()("@tanren/IdGenerator") {
  /** Web Crypto exists in Workers, Hermes and browsers; `Effect.sync` keeps it lazy. */
  static readonly layer = Layer.succeed(
    this,
    this.of({ next: Effect.sync(() => crypto.randomUUID()).pipe(Effect.flatMap(Uuid.makeEffect), Effect.orDie) }),
  )
  /** Deterministic ids for tests: 00000000-0000-4000-8000-000000000001, …002, … (Ref-backed counter). */
  static readonly layerTest: Layer.Layer<IdGenerator> = /* Layer.effect(this, Effect.gen(…)) */ undefined as never
}
/** `yield* newId(SetId)` gives a fresh branded id. `make` is safe here: the Uuid is already validated. */
export const newId = <Id extends Schema.brand<typeof Uuid, string>>(id: Id): Effect.Effect<Id["Type"], never, IdGenerator> =>
  IdGenerator.use((g) => g.next).pipe(Effect.map((uuid) => id.make(uuid)))
```

`Effect.orDie` is right: `crypto.randomUUID()` always yields a valid UUID, so a
failed check is a defect. The engineer finalises `layerTest` and confirms the
`newId` generic compiles (`Schema.brand<S, B>` is the interface returned by
`Schema.brand`, `Schema.ts:5254`); if the bound is awkward, use
`Id extends Schema.Top & { readonly make: (u: Uuid) => Id["Type"] }`.

---

## 5. Enumerations (`Schema.Literals`)

| Schema | File | Values (in order) |
| --- | --- | --- |
| `Weekday` | common | `mon tue wed thu fri sat sun` |
| `EntityName` | common | `user profile exercise plan planWeek plannedSession plannedSet session set` |
| `SyncTable` | common | `profile exercise plan planWeek plannedSession plannedSet session set` |
| `GoalKind` | user | `strength hypertrophy endurance fatLoss mobility generalFitness sport other` |
| `EquipmentKind` | user | `barbell dumbbells kettlebell rack bench cableMachine machines smithMachine trapBar ezBar pullUpBar dipStation resistanceBands cardioMachine bodyweightOnly other` |
| `MuscleGroup` | exercise | `chest lats upperBack lowerBack traps shoulders biceps triceps forearms core quads hamstrings glutes adductors calves fullBody cardio` |
| `PlanStatus` | plan | `active archived` |
| `RepTarget._tag` | plan | `Exact Range` |
| `RejectReason` | sync | `forbidden missingParent immutableFieldChanged invariantViolated` |

Adding a literal is additive and safe; renaming or removing one after data
exists needs a D1 migration and a client update. Owner to confirm the lists
(§14 Q1).

---

## 6. Value objects (`Schema.Struct`)

### `Goal` (user.ts)

| Field | TS type | Wire | Constraints |
| --- | --- | --- | --- |
| `kind` | `GoalKind` | string | — |
| `note` | `Option<Note>` | string \| null | required (`Some`) when `kind === "other"` (struct `check`) |

### `Equipment` (user.ts)

| Field | TS type | Wire | Constraints |
| --- | --- | --- | --- |
| `kind` | `EquipmentKind` | string | — |
| `note` | `Option<Note>` | string \| null | required when `kind === "other"`; otherwise free detail ("adjustable 2×32 kg") |

```ts
const requiresNoteForOther = Schema.makeFilter(
  (v: { readonly kind: string; readonly note: Option.Option<string> }) =>
    v.kind !== "other" || Option.isSome(v.note) || { path: ["note"], issue: "required when kind is \"other\"" },
)   // `{ path, issue }` form: the error names the field; add no filter-level `message` annotation
export const Goal = Schema.Struct({ kind: GoalKind, note: Schema.OptionFromNullOr(Note) }).check(requiresNoteForOther)
```

### `RepTarget` (plan.ts) — discriminated on `_tag`

| Member | Fields | Wire example | Constraints |
| --- | --- | --- | --- |
| `Exact` | `reps: Reps` | `{"_tag":"Exact","reps":8}` | — |
| `Range` | `min: Reps`, `max: Reps` | `{"_tag":"Range","min":8,"max":12}` | `min < max` (struct `check`); use `Exact` for equal bounds |

```ts
export const RepTarget = Schema.Union([
  Schema.TaggedStruct("Exact", { reps: Reps }),
  Schema.TaggedStruct("Range", { min: Reps, max: Reps }).check(
    Schema.makeFilter((r: { readonly min: number; readonly max: number }) => r.min < r.max || { path: ["max"], issue: "must be greater than min" }),
  ),
])
```
Matched with `Match.tag("Exact", …)` / `Match.tag("Range", …)` + `Match.exhaustive`.
Today-screen prefill: `Exact.reps`, `Range.min`. A future `Amrap` member is
additive (§14 Q4).

### `ValidationIssue` (errors.ts)

| Field | TS type | Wire |
| --- | --- | --- |
| `path` | `ReadonlyArray<string \| number>` | array |
| `message` | `string` | string |

---

## 7. Entities

Pattern for every synced entity `X` with id brand `XId` (verbatim; do not vary):

```ts
export const XFields = { /* own fields, incl. parent ids */ }
export class X extends Schema.Class<X>("@tanren/shared/X")({ ...rowFields(XId), ...XFields }) {}
export type XEncoded = typeof X["Encoded"]
export const XInsert = X.mapFields(Struct.omit(ROW_COLUMNS))        // server adds id, userId, timestamps
export const XPatch = X
  .mapFields(Struct.omit([...ROW_COLUMNS /* , immutable parent ids, if any */]))
  .mapFields(Struct.map(Schema.optionalKey))                        // exact partial: absent key = unchanged
export type XInsert = typeof XInsert.Type;  export type XPatch = typeof XPatch.Type
```

`Insert` is the REST/MCP creation payload: the caller never supplies `id`,
`userId` or timestamps (the server generates a UUID, takes `userId` from the
session, stamps `createdAt = updatedAt = now`; the illustrative `SetInsert` in
the effect-conventions skill keeps `id` — this design is normative for
`shared`). Clients that work offline do
not use `Insert`; they create full rows locally and sync them (§10). `Patch`
keys that are present replace the field; `Option` fields accept `null` to
clear. Parent ids (`sessionId`, `plannedSessionId`, `planWeekId`, `planId`)
are omitted from `Patch` because they are immutable (§11.1). `X.mapFields(...)` results
carry **no** struct-level checks (field checks survive);
where an invariant spans fields that `Insert` also has (`Session`), attach the
same filter to `XInsert` (§7.8).

### 7.0 Row columns — `rowFields(id)` (common.ts)

```ts
export const ROW_COLUMNS = ["id", "userId", "createdAt", "updatedAt", "deletedAt"] as const

export const rowFields = <Id extends Schema.Constraint>(id: Id) => ({
  id,
  userId: UserId,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  deletedAt: Schema.OptionFromNullOr(Timestamp),
})
```

| Field | TS type | Wire | Constraints / notes |
| --- | --- | --- | --- |
| `id` | `XId` | UUID string | generated by the creator (client offline, or server); immutable |
| `userId` | `UserId` | UUID string | owner; immutable; must equal the authenticated user on every write |
| `createdAt` | `DateTime.Utc` | ISO string | creator's clock at creation; immutable |
| `updatedAt` | `DateTime.Utc` | ISO string | writer's clock at every write; the LWW key; `≥ createdAt` |
| `deletedAt` | `Option<DateTime.Utc>` | ISO string \| null | `Some` = soft-deleted (tombstone); set together with `updatedAt`; never un-set except by a newer write |

### 7.1 `User` (user.ts) — not synced, no row columns

| Field | TS type | Wire | Constraints |
| --- | --- | --- | --- |
| `id` | `UserId` | UUID | Better Auth must be configured to generate UUID ids (step 3) |
| `email` | `Email` | string | — |
| `name` | `Option<Label>` | string \| null | — |
| `createdAt` | `DateTime.Utc` | ISO string | from the auth table |
| `updatedAt` | `DateTime.Utc` | ISO string | from the auth table |

`export class User extends Schema.Class<User>("@tanren/shared/User")({ … }) {}`. No
`UserInsert`/`UserPatch`: the auth layer owns writes.

### 7.2 `Profile` (user.ts) — `rowFields(UserId)`, invariant `id === userId`

| Field | TS type | Wire | Constraints |
| --- | --- | --- | --- |
| `goals` | `ReadonlyArray<Goal>` | array | ordered by priority; `isMaxLength(10)` |
| `constraints` | `ReadonlyArray<Note>` | array of strings | free-text limitations ("no overhead pressing, left shoulder"); `isMaxLength(20)` |
| `availableDays` | `ReadonlyArray<Weekday>` | array of strings | `Schema.UniqueArray(Weekday)`; a set |
| `equipment` | `ReadonlyArray<Equipment>` | array | `isMaxLength(30)` |
| `timezone` | `TimeZone` | string | IANA zone name, used by the server/MCP to compute "today" |

`ProfileInsert = Profile.mapFields(Struct.omit(ROW_COLUMNS))` (server sets `id = userId`),
`ProfilePatch` = exact partial of all five fields. The `id === userId`
invariant is enforced by the server (and by the D1 primary key `user_id`),
not by the schema.

### 7.3 `Exercise` (exercise.ts) — `rowFields(ExerciseId)`

| Field | TS type | Wire | Constraints |
| --- | --- | --- | --- |
| `name` | `Label` | string | unique per user among non-deleted exercises, case-insensitive (server, §11.3) |
| `aliases` | `ReadonlyArray<Label>` | array of strings | unique case-insensitively within the array and different from `name` (struct `check` with `makeFilter`, compare `toLowerCase()`); `isMaxLength(20)` |
| `muscleGroups` | `ReadonlyArray<MuscleGroup>` | array of strings | `Schema.UniqueArray(MuscleGroup)`; may be empty (not yet classified) |
| `notes` | `Option<Text>` | string \| null | cues, setup |

`ExercisePatch`: all four fields (no immutable parents).

### 7.4 `Plan` (plan.ts) — `rowFields(PlanId)`

| Field | TS type | Wire | Constraints |
| --- | --- | --- | --- |
| `name` | `Label` | string | — |
| `goal` | `Text` | string | free text written by Claude ("12-week strength block, squat to 140") |
| `startDate` | `LocalDate` | `YYYY-MM-DD` | — |
| `status` | `PlanStatus` | string | at most one `active` plan per user among non-deleted plans (server) |

### 7.5 `PlanWeek` (plan.ts) — `rowFields(PlanWeekId)`

| Field | TS type | Wire | Constraints |
| --- | --- | --- | --- |
| `planId` | `PlanId` | UUID | immutable; omitted from `PlanWeekPatch` |
| `weekStart` | `LocalDate` | `YYYY-MM-DD` | first day of the week; unique per plan; weeks of one plan do not overlap (7-day windows) (server) |
| `intent` | `Option<Text>` | string \| null | what the week is for ("deload", "volume") |

### 7.6 `PlannedSession` (plan.ts) — `rowFields(PlannedSessionId)`

| Field | TS type | Wire | Constraints |
| --- | --- | --- | --- |
| `planWeekId` | `PlanWeekId` | UUID | immutable; omitted from Patch |
| `order` | `OrderIndex` | integer | position within the week (§11.2) |
| `name` | `Label` | string | name/focus ("Upper A — push") |
| `scheduledDate` | `Option<LocalDate>` | `YYYY-MM-DD` \| null | `None` = any day that week; when `Some`, within `[weekStart, weekStart + 6]` (server) |
| `notes` | `Option<Text>` | string \| null | — |

The exercises of a planned session are not a separate entity: they are the
groups of its `PlannedSet`s by `exerciseId`, ordered by the smallest `order`
in each group (§11.2). This keeps the plan's model (`plannedSession →
plannedSet`) and still supports supersets.

### 7.7 `PlannedSet` (plan.ts) — `rowFields(PlannedSetId)`

| Field | TS type | Wire | Constraints |
| --- | --- | --- | --- |
| `plannedSessionId` | `PlannedSessionId` | UUID | immutable; omitted from Patch |
| `exerciseId` | `ExerciseId` | UUID | must exist for the user (server); mutable (swap) |
| `order` | `OrderIndex` | integer | position within the session |
| `targetWeightKg` | `Option<WeightKg>` | number \| null | `None` = decide at the gym (prefill from history) |
| `targetReps` | `RepTarget` | object | §6 |
| `targetRpe` | `Option<Rpe>` | number \| null | — |
| `restSeconds` | `Option<RestSeconds>` | integer \| null | drives the auto rest timer |
| `note` | `Option<Note>` | string \| null | cue for this set ("pause 2 s") |

### 7.8 `Session` (session.ts) — `rowFields(SessionId)`

| Field | TS type | Wire | Constraints |
| --- | --- | --- | --- |
| `startedAt` | `DateTime.Utc` | ISO string | — |
| `finishedAt` | `Option<DateTime.Utc>` | ISO string \| null | `None` = in progress; when `Some`, `≥ startedAt` (`sessionTimeOrder` filter on the class struct **and** on `SessionInsert`; `SessionPatch` cannot carry it — the server validates after merging) |
| `plannedSessionId` | `Option<PlannedSessionId>` | UUID \| null | `None` = unplanned session; mutable |
| `notes` | `Option<Text>` | string \| null | — |

```ts
const sessionTimeOrder = Schema.makeFilter(
  (s: { readonly startedAt: DateTime.Utc; readonly finishedAt: Option.Option<DateTime.Utc> }) =>
    Option.match(s.finishedAt, {
      onNone: () => true,
      onSome: (finishedAt) =>
        DateTime.Order(finishedAt, s.startedAt) >= 0 || { path: ["finishedAt"], issue: "must not be before startedAt" },
    }),
)
export class Session extends Schema.Class<Session>("@tanren/shared/Session")(
  Schema.Struct({ ...rowFields(SessionId), ...SessionFields }).check(sessionTimeOrder),
) {}
export const SessionInsert = Session.mapFields(Struct.omit(ROW_COLUMNS)).check(sessionTimeOrder)
```

### 7.9 `WorkoutSet` (session.ts) — `rowFields(SetId)`

| Field | TS type | Wire | Constraints |
| --- | --- | --- | --- |
| `sessionId` | `SessionId` | UUID | immutable; omitted from Patch |
| `exerciseId` | `ExerciseId` | UUID | mutable (fix a mis-tap) |
| `order` | `OrderIndex` | integer | position within the session |
| `weightKg` | `WeightKg` | number | `0` for pure bodyweight; added load otherwise |
| `reps` | `Reps` | integer | — |
| `rpe` | `Option<Rpe>` | number \| null | — |
| `note` | `Option<Note>` | string \| null | — |
| `plannedSetId` | `Option<PlannedSetId>` | UUID \| null | the set this one fulfils; `None` for ad-hoc sets |
| `loggedAt` | `DateTime.Utc` | ISO string | when the set was performed (may be backfilled); `createdAt` is the row's creation |

---

## 8. Derived input types — summary

| Entity | `Insert` = `X.mapFields(Struct.omit(ROW_COLUMNS))` | `Patch` additionally omits (immutable), then exact-partial |
| --- | --- | --- |
| Profile | `ProfileInsert` (server sets `id = userId`) | `ProfilePatch`: nothing omitted |
| Exercise | `ExerciseInsert` | `ExercisePatch`: nothing omitted |
| Plan | `PlanInsert` | `PlanPatch`: nothing omitted |
| PlanWeek | `PlanWeekInsert` | `PlanWeekPatch`: omit `planId` |
| PlannedSession | `PlannedSessionInsert` | `PlannedSessionPatch`: omit `planWeekId` |
| PlannedSet | `PlannedSetInsert` | `PlannedSetPatch`: omit `plannedSessionId` |
| Session | `SessionInsert` | `SessionPatch`: nothing omitted |
| WorkoutSet | `WorkoutSetInsert` | `WorkoutSetPatch`: omit `sessionId` |

Type shape of a patch under `exactOptionalPropertyTypes`:
`{ readonly rpe?: Option<Rpe>; readonly note?: Option<Note>; … }`; wire
`{ "rpe"?: number | null, … }`. Three states per field: absent = keep,
`null` = clear, value = set.

---

## 9. Errors (`errors.ts`) — `Schema.TaggedError`, wire-encodable

```ts
import { Schema, SchemaIssue } from "effect"

export const ValidationIssue = Schema.Struct({
  path: Schema.Array(Schema.Union([Schema.String, Schema.Number])),
  message: Schema.String,
})

export class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
  entity: EntityName,
  id: Uuid,
}, { httpApiStatus: 404 }) {}

export class Forbidden extends Schema.TaggedError<Forbidden>()("Forbidden", {
  message: Schema.String,                      // human-readable; never leaks other users' data
}, { httpApiStatus: 403 }) {}

export class ValidationError extends Schema.TaggedError<ValidationError>()("ValidationError", {
  message: Schema.String,
  issues: Schema.Array(ValidationIssue),
}, { httpApiStatus: 400 }) {
  /** For `X.makeEffect` failures, which are a bare `SchemaIssue.Issue`. */
  static fromIssue(issue: SchemaIssue.Issue): ValidationError {
    return new ValidationError({
      message: formatMessage(issue),
      issues: formatIssues(issue).issues.map((i) => ({
        path: i.path.map((k) => (typeof k === "number" ? k : String(k))),
        message: i.message,
      })),
    })
  }
  /** For `Schema.decodeUnknownEffect` failures. */
  static fromSchemaError(error: Schema.SchemaError): ValidationError {
    return ValidationError.fromIssue(error.issue)
  }
}
// module level, created once:
// const formatMessage = SchemaIssue.makeFormatterDefault()
// const formatIssues = SchemaIssue.makeFormatterStandardSchemaV1()

export class SyncConflict extends Schema.TaggedError<SyncConflict>()("SyncConflict", {
  table: SyncTable,
  id: Uuid,
  clientUpdatedAt: Timestamp,
  serverUpdatedAt: Timestamp,
}, { httpApiStatus: 409 }) {}
```

| Error | HTTP | Raised when |
| --- | --- | --- |
| `NotFound` | 404 | a row of `entity` with `id` does not exist for the authenticated user (deleted rows count as not found for REST/MCP reads) |
| `Forbidden` | 403 | a write names a `userId` other than the authenticated user, or the auth context is missing a required scope (MCP write tools, step 5) |
| `ValidationError` | 400 | a payload decoded structurally but violates a server-side invariant (§11.3); also the mapping of `Schema.SchemaError` at non-HttpApi boundaries (MCP tool inputs, local store) |
| `SyncConflict` | 409 | a REST `PATCH`/MCP write carries a base `updatedAt` older than the server row (optimistic concurrency for single-row writes). The batched sync endpoint never raises it: LWW outcomes are reported in `PushResponse.conflicts` |

Wire form (`Schema.encodeSync(NotFound)(e)`):
`{"_tag":"NotFound","entity":"exercise","id":"0a1b2c3d-…"}`. The
`httpApiStatus` annotation is a plain annotation key read by
`effect/http-api` (`HttpApiError.ts` uses the same key for its built-ins), so
`shared` does not import `effect/http-api`. Errors are constructed with
`new NotFound({ … })` and yielded (`return yield* new NotFound({ … })`).
`Data.TaggedError` remains for purely internal errors that never cross a
schema boundary (none in `shared`).

---

## 10. Sync protocol (`sync.ts`)

Endpoints (step 3): `POST /sync/push` with `PushRequest` → `PushResponse`;
`POST /sync/pull` with `PullRequest` → `PullResponse`. Both are JSON bodies
so one encoding convention (`null` for `None`) applies.

### 10.1 Envelope

```ts
export const SYNC_TABLE_ORDER = ["profile", "exercise", "plan", "planWeek", "plannedSession", "plannedSet", "session", "set"] as const  // parents first
export const MAX_PUSH_CHANGES = 500

const member = <T extends SyncTable, Row extends Schema.Constraint>(table: T, row: Row) =>
  Schema.Struct({ table: Schema.Literal(table), row })

export const SyncChange = Schema.Union([
  member("profile", Profile),
  member("exercise", Exercise),
  member("plan", Plan),
  member("planWeek", PlanWeek),
  member("plannedSession", PlannedSession),
  member("plannedSet", PlannedSet),
  member("session", Session),
  member("set", WorkoutSet),
])
export type SyncChange = typeof SyncChange.Type

export const SyncCursor = Schema.Trimmed.check(Schema.isMinLength(1), Schema.isMaxLength(512)).pipe(Schema.brand("SyncCursor"))

export const AcceptedChange = Schema.Struct({ table: SyncTable, id: Uuid, updatedAt: Timestamp })
export const RejectReason = Schema.Literals(["forbidden", "missingParent", "immutableFieldChanged", "invariantViolated"])
export const RejectedChange = Schema.Struct({ table: SyncTable, id: Uuid, reason: RejectReason, message: Schema.String })

export const PushRequest  = Schema.Struct({ changes: Schema.Array(SyncChange).check(Schema.isMaxLength(MAX_PUSH_CHANGES)) })
export const PushResponse = Schema.Struct({
  accepted: Schema.Array(AcceptedChange),
  conflicts: Schema.Array(SyncChange),        // the server's winning rows; apply them locally
  rejected: Schema.Array(RejectedChange),
  serverTime: Timestamp,
})
export const PullRequest  = Schema.Struct({ since: Schema.OptionFromNullOr(SyncCursor), limit: PageLimit })
export const PullResponse = Schema.Struct({
  changes: Schema.Array(SyncChange),
  cursor: SyncCursor,                         // pass as `since` next time
  serverTime: Timestamp,
  hasMore: Schema.Boolean,
})
```

`SyncChange` is discriminated on **`table`** (not `_tag`): the JSON reads as
data (`{"table":"set","row":{…}}`) and the same literal names the D1 table
mapping and `AcceptedChange.table`. Match with
`Match.value(change).pipe(Match.discriminatorsExhaustive("table")({ profile: ({ row }) => …, set: ({ row }) => …, … }))`.
A soft delete is an ordinary change whose `row.deletedAt` is `Some`; there is
no separate delete operation.

**Cursor (refinement of the brief's `since: Option<Timestamp>`).** `since`
is an opaque, server-issued `SyncCursor`, not a client timestamp. Reason:
`updatedAt` is stamped by client clocks for LWW; a device with a slow clock
would write rows "in the past" that another device, already past that point,
would never pull. The server keeps its own monotonic sync order per row
(step 2: `server_seq INTEGER` from a counter, or `synced_at` + `(table, id)`
tiebreak; the cursor encodes that position) and pages on it. Clients treat
the cursor as a string. `serverTime` is still returned for clock-skew
detection and display.

### 10.2 Server rules for `push` (normative; implemented in step 3)

1. `now = serverTime` (one value for the whole request).
2. Sort `changes` by `SYNC_TABLE_ORDER` rank, then by `row.updatedAt`.
3. For each change, in order:
   - `row.userId !== auth.userId` → `rejected(forbidden)`.
   - `table === "profile" && row.id !== auth.userId` → `rejected(invariantViolated)`.
   - Parent (`planId`, `planWeekId`, `plannedSessionId`, `sessionId`; and
     `exerciseId` for `plannedSet`/`set`) must exist for this user (deleted or
     not) or be accepted earlier in this batch → else `rejected(missingParent)`.
   - `effectiveUpdatedAt = row.updatedAt > now + 5 min ? now : row.updatedAt`
     (clamps runaway client clocks; the client adopts the returned value).
   - No existing row → insert with `effectiveUpdatedAt`; `accepted`.
   - Existing row with different `createdAt` or different immutable parent
     id → `rejected(immutableFieldChanged)`.
   - `effectiveUpdatedAt > existing.updatedAt` → overwrite the whole row;
     `accepted`.
   - Otherwise (older **or equal**) → keep the server row and return it in
     `conflicts` (ties go to the server).
4. Every accepted write gets a new server sync position so other devices pull it.
5. The whole request is one D1 batch (atomic per request); `accepted`,
   `conflicts` and `rejected` partition the input by `(table, id)`.

### 10.3 Client rules (step 6; recorded here so the contract is complete)

- Rows are created and edited locally with ids from `IdGenerator` and
  client timestamps; every local write marks the row dirty. Push sends dirty rows
  (all tables, ≤ `MAX_PUSH_CHANGES` per request, parents first).
- On `accepted`: clear dirty, set local `updatedAt` to the returned value.
  On `conflicts`: apply the server row (LWW rule below) and clear dirty. On
  `rejected`: keep the row locally flagged for the owner; do not retry
  unchanged.
- Pull with the stored cursor (`null` the first time) until `hasMore` is
  false; apply each change with the same LWW rule: upsert when the local row
  is absent or `incoming.updatedAt > local.updatedAt`, otherwise ignore.
  Store the cursor only after the page is applied. Pull also returns this
  device's own rows; applying them is a no-op.
- Tombstones (`deletedAt: Some`) are stored, hidden in the UI, and never
  purged in this version. The local store tolerates children whose parent
  has not arrived yet (no FK enforcement in SQLite, or deferred).

### 10.4 JSON example

`POST /sync/push` request (a session with one logged set):

```json
{
  "changes": [
    {
      "table": "session",
      "row": {
        "id": "b3e7c0a2-5d1f-4a7b-8c9d-0e1f2a3b4c5d",
        "userId": "6f1d2b7e-3c4a-4e2b-9a0e-1f2a3b4c5d6e",
        "startedAt": "2026-10-19T17:02:11.000Z",
        "finishedAt": null,
        "plannedSessionId": "7c8d9e0f-1a2b-4c3d-9e4f-5a6b7c8d9e0f",
        "notes": null,
        "createdAt": "2026-10-19T17:02:11.000Z",
        "updatedAt": "2026-10-19T17:02:11.000Z",
        "deletedAt": null
      }
    },
    {
      "table": "set",
      "row": {
        "id": "9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b",
        "userId": "6f1d2b7e-3c4a-4e2b-9a0e-1f2a3b4c5d6e",
        "sessionId": "b3e7c0a2-5d1f-4a7b-8c9d-0e1f2a3b4c5d",
        "exerciseId": "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
        "order": 0,
        "weightKg": 102.5,
        "reps": 5,
        "rpe": 8.5,
        "note": null,
        "plannedSetId": "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a",
        "loggedAt": "2026-10-19T17:08:40.000Z",
        "createdAt": "2026-10-19T17:08:40.000Z",
        "updatedAt": "2026-10-19T17:08:40.000Z",
        "deletedAt": null
      }
    }
  ]
}
```

Response:

```json
{
  "accepted": [
    { "table": "session", "id": "b3e7c0a2-5d1f-4a7b-8c9d-0e1f2a3b4c5d", "updatedAt": "2026-10-19T17:02:11.000Z" },
    { "table": "set", "id": "9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b", "updatedAt": "2026-10-19T17:08:40.000Z" }
  ],
  "conflicts": [],
  "rejected": [],
  "serverTime": "2026-10-19T17:09:12.418Z"
}
```

`POST /sync/pull` request `{ "since": null, "limit": 200 }` → response:

```json
{
  "changes": [
    {
      "table": "exercise",
      "row": {
        "id": "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
        "userId": "6f1d2b7e-3c4a-4e2b-9a0e-1f2a3b4c5d6e",
        "name": "Back squat",
        "aliases": ["squat", "high-bar squat"],
        "muscleGroups": ["quads", "glutes", "core"],
        "notes": null,
        "createdAt": "2026-10-01T06:00:00.000Z",
        "updatedAt": "2026-10-01T06:00:00.000Z",
        "deletedAt": null
      }
    }
  ],
  "cursor": "MjAyNi0xMC0xOVQxNzowOToxMi4wMDBafGV4ZXJjaXNlfDBhMWIyYzNk",
  "serverTime": "2026-10-19T17:09:12.418Z",
  "hasMore": false
}
```

The `sync.test.ts` fixture is exactly this push request; it must decode with
`Schema.decodeUnknownSync(PushRequest)` and re-encode to the same JSON.

---

## 11. Invariants

### 11.1 Immutable fields (server rejects with `immutableFieldChanged`; `Patch` omits them)

`id`, `userId`, `createdAt` on every row; `PlanWeek.planId`,
`PlannedSession.planWeekId`, `PlannedSet.plannedSessionId`,
`WorkoutSet.sessionId`. Moving a child to another parent is delete + create.

### 11.2 Ordering

`order` is a 0-based `OrderIndex` within the parent (`PlannedSession` in
its week, `PlannedSet` in its session, `WorkoutSet` in its session). Gaps and
duplicates are tolerated (offline edits on two devices can collide); the
canonical sort key is `(order, createdAt, id)` ascending, applied by every
reader. Exercise blocks of a session = group sets by `exerciseId`, blocks
ordered by the smallest `order` in the block, sets within a block by the
sort key. Writers renumber `0..n-1` after a reorder.

### 11.3 Uniqueness and existence (server/repository, steps 2–3; D1 indexes where possible)

- `Exercise.name` unique per user among non-deleted rows, case-insensitive
  (`UNIQUE(user_id, lower(name)) WHERE deleted_at IS NULL`).
- An exercise name or alias resolves to at most one non-deleted exercise per
  user, case-insensitive (checked in the repository on write; aliases are a
  JSON column).
- One `Profile` per user, `id === userId` (PK `user_id`).
- At most one `Plan` with `status = active` per user among non-deleted rows.
- `PlanWeek.weekStart` unique per plan; weeks do not overlap.
- `PlannedSession.scheduledDate`, when present, lies in its week.
- Referenced parents and `exerciseId` exist for the same user (deleted
  parents allowed; UI hides them).
- `updatedAt ≥ createdAt`; `deletedAt`, when present, `≤ updatedAt`.

### 11.4 Checked by the schemas (shared)

Numeric ranges and granularity; string trimmedness and lengths; UUID shape;
calendar validity of `LocalDate`; uniqueness inside `availableDays`,
`muscleGroups`, `aliases` (case-insensitive) and `aliases ∌ name`;
`RepTarget.Range.min < max`; `Goal`/`Equipment` with `kind: "other"` carry a
note; `Session.finishedAt ≥ startedAt` (`sessionTimeOrder` on the class struct and on `SessionInsert`);
`PushRequest.changes.length ≤ 500`.

### 11.5 Sync

Ties on `updatedAt` go to the server. `updatedAt` more than 5 minutes ahead
of the server clock is clamped to `serverTime`. A soft delete is a normal
write. Pull order is the server's sync order, never `updatedAt`.

---

## 12. API mapping (Effect 4.0.5) — what engineers use for each need

| Need | Effect 4.0.5 API | Source checked |
| --- | --- | --- |
| Imports | `import { Context, DateTime, Effect, Layer, Match, Option, Schema, SchemaIssue, Struct } from "effect"` (one line; only what the module uses) | fact sheet §3 |
| Branded UUID | `Schema.String.check(Schema.isUUID()).pipe(Schema.brand("SetId"))`; type `typeof SetId.Type` | `Schema.ts:7027, 5254` |
| Option ↔ null | `Schema.OptionFromNullOr(X)` | `Schema.ts:14934` |
| Timestamp | `Schema.DateTimeUtcFromString` → `DateTime.Utc` / `string`; decode via `DateTime.make` (lenient: zone-less = UTC, offsets normalised), encode `DateTime.formatIso` = `toISOString()`. Strict ISO-only variant if ever needed: `Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)).pipe(Schema.decodeTo(Schema.DateTimeUtc, SchemaTransformation.dateTimeUtcFromString))` | `Schema.ts:11650, 11675–11683`, `DateTime.ts:4538`; research note §5 |
| Integers / ranges | `Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum, maximum }))`, `isGreaterThanOrEqualTo`, `isLessThanOrEqualTo`, `isMultipleOf(n)`; `Schema.Int` exists | `Schema.ts:7735–7953` |
| Strings | `Schema.Trimmed`, `Schema.isMinLength`, `isMaxLength`, `isPattern(re)`, `isNonEmpty()` — length checks work on strings **and arrays** (`{ readonly length: number }`) | `Schema.ts:6864, 6903, 8446, 8499, 8525` |
| Enums | `Schema.Literals([...])`, `.literals`, `.pick([...])`; single: `Schema.Literal("x")` | `Schema.ts:4989, 2706` |
| Unions | `Schema.Union([A, B])`; `Schema.TaggedStruct("Tag", fields)` | `Schema.ts:4892, 6255` |
| Arrays | `Schema.Array(X)` (`ReadonlyArray`), `Schema.UniqueArray(X)` (uniqueness by Effect equality), `Schema.NonEmptyArray(X)` | `Schema.ts:4680, 4799, 4703` |
| Custom check | `.check(Schema.makeFilter((v) => boolean \| string \| FilterIssue[], { expected }))` or `.pipe(Schema.check(...))` | `Schema.ts:6775, 5185` |
| Entity class | `Schema.Class<X>("X")({ ...fields })`: `.fields`, `new X(props, { disableChecks? })` validates, `X.make / makeOption / makeEffect` | `Schema.ts:15753, 228–280, 201, 16313–16320`; a `Schema.Struct({...}).check(...)` argument is accepted and its checks run in `new`, `make*` and decode (research note §1) |
| Tagged error | `Schema.TaggedError<E>()("E", fields, { httpApiStatus: 404 })`; yieldable; `_tag` auto | `Schema.ts:16653`, `http-api/HttpApiError.ts:145` |
| Derive inputs | `X.mapFields(Struct.omit([...]))`, `.mapFields(Struct.map(Schema.optionalKey))` (class and struct both have `mapFields`) | `Schema.ts:3528, 15786`, `Struct.ts:348, 1184` |
| Struct-level checks | `X.mapFields(...)` results carry **no** struct-level checks (field checks survive); re-attach the filter where the invariant applies | research note §1 |
| Unique arrays | `Schema.UniqueArray(X)` dedupes with Effect `Equal`/`Hash` (exact, case-sensitive for strings); case-insensitive uniqueness is a custom `makeFilter` | `Schema.ts:4815, 9092`; research note §3 |
| Decode / encode | `Schema.decodeUnknownEffect(X)` → `Effect<T, SchemaError>`; `decodeUnknownSync`, `encodeSync`, `Schema.is` | `Schema.ts:1524, 1872, 2307, 1450` |
| Issues → ValidationError | `Schema.SchemaError` (`.issue`, `.message`); `SchemaIssue.makeFormatterStandardSchemaV1()(issue).issues: { message, path: ReadonlyArray<PropertyKey> }[]` | `SchemaIssue.ts:1303–1315` |
| Matching | `Match.value(c).pipe(Match.discriminatorsExhaustive("table")({...}))`; `Match.tag`, `Match.exhaustive` for `_tag` unions | `Match.ts:980, 1096, 1160, 1218, 2294` |
| DateTime ops | `DateTime.Order`, `DateTime.isGreaterThan`, `DateTime.formatIso`, `DateTime.toEpochMillis`, `DateTime.make` (Option), `DateTime.makeUnsafe`, `DateTime.now` (Effect) | `DateTime.ts:575, 1699, 4538, 2233, 861, 717, 908` |
| Constructing values | `WeightKg.make(100)`, `SetId.make("…")`, `new WorkoutSet({...})` run checks and **throw** a plain `Error("Schema validation failed", { cause: SchemaIssue.Issue })` — not a `SchemaError` — so: fixtures and already-typed values only. Domain code uses `X.makeEffect({...})`, which fails with a bare `SchemaIssue.Issue` → `ValidationError.fromIssue` | `Schema.ts:228–280`; compiled snippets in the effect-conventions skill (S1-T9) |
| JSON columns (step 2) | `Schema.fromJsonString(X)` | `Schema.ts:9791` |
| Generic field bound | `Id extends Schema.Constraint` in `rowFields` and `member` (`Struct.Fields = { readonly [x: PropertyKey]: Constraint }`) | `Schema.ts:807, 3352` |

Removed v3 names that must not appear: `Schema.UUID`, `Schema.Literal("a","b")`,
`Schema.Union(A,B)`, `Schema.omit/pick/partial`, `Schema.DateTimeUtc` as a
string codec, `Schema.decodeUnknown`, `ParseResult.*`, `Context.Tag`.

---

## 13. Test expectations for `packages/shared` (what QA checks)

- Every scalar in §4: one passing and one failing value per constraint
  (`100.1` kg, `7.25` RPE, `-1` reps, `2026-02-30`, untrimmed `" x"`,
  non-UUID id, bad timezone pattern).
- Every entity: decode the §10.4-style fixture, encode → decode round-trip
  equals (`Equal.equals`) the original; `null` ↔ `None` on every Option
  field; a missing row column fails with the field name in the issue path.
- `Patch`: absent key, `null`, and value decode to the three states;
  immutable parent key is rejected as unexpected (or ignored, per schema
  default — assert whichever `Struct` does and document it).
- `RepTarget`: `Range` with `min ≥ max` fails; `Exact` ok; exhaustive match
  compiles.
- `Goal`/`Equipment`: `other` without note fails.
- Errors: `encodeSync` of each error yields `_tag` + fields;
  `ValidationError.fromSchemaError` maps a nested failure to `path`
  `["row", "reps"]`-style arrays.
- Sync: the §10.4 push request decodes and re-encodes byte-equal (after
  JSON canonicalisation); 501 changes fail; `since: null` → `None`;
  `discriminatorsExhaustive("table")` over all eight members compiles.
- Runtime facts the research note could only trace
  (`docs/research/2026-10-19-effect4-schema-details.md`, Unknowns), one test
  each in the module that owns the schema: `new WorkoutSet(bad)` throws an
  `Error` whose `cause` satisfies `SchemaIssue.isIssue`; `UniqueArray` accepts
  `["a", "A"]` (case-sensitive) while the alias filter rejects it; `Timestamp`
  decodes `2026-10-19T12:00:00+02:00` and encodes `2026-10-19T10:00:00.000Z`;
  a `{ path, issue }` filter result formats with its path.

---

## 14. Open questions for the owner (≤ 5)

1. **Enum lists.** Confirm or extend `MuscleGroup`, `GoalKind`,
   `EquipmentKind` (§5) now; renames after data exists cost a migration.
2. **Pull cursor.** `since` is an opaque server-issued cursor instead of a
   client timestamp (§10.1, correctness under clock skew). OK?
3. **Week start.** `PlanWeek.weekStart` may be any weekday (no Monday-only
   rule). Keep it that way?
4. **Bodyweight, holds and AMRAP.** Current design: bodyweight sets log
   `weightKg: 0`, timed holds log seconds as `reps`, and `RepTarget` has no
   `Amrap` member. Acceptable for now, or add an exercise `kind` and `Amrap`
   in step 1?
5. **Profile extras.** Bodyweight (kg) and a units preference are out
   (kg-only per plan). Add either now?

---

## 15. Truth-ups this design requires (for the Lead / S1 docs task)

- `packages/shared/CLAUDE.md`: `Timestamp` is `DateTime.Utc` via
  `Schema.DateTimeUtcFromString` (not `Date`); `Weight` → `WeightKg`; `Set` →
  `WorkoutSet`; `errors.ts` uses `Schema.TaggedError` (not `Data.TaggedError`);
  Insert/Patch derive with `X.mapFields(Struct.omit/map)` (not `Schema.omit/partial`); `IdGenerator` lives in `ids.ts`;
  `SyncChange` is discriminated on `table`; add `LocalDate`, `EntityName`,
  `SyncTable`, `rowFields` to the `common.ts` line; `sync.ts` line per §10.
- `.claude/rules/effect.md` / `effect-conventions` skill (already on Effect 4
  after S1-T9): allow a discriminator other than `_tag` when the field is the
  natural key (`table` in `SyncChange`, matched with
  `Match.discriminatorsExhaustive`); align the illustrative snippets with this
  design — branded `WeightKg`/`Reps`/`Rpe`, `Insert` without `id`, the §10
  `SyncChange` envelope instead of `Upsert`/`Delete`, `ValidationError` with
  `issues` plus `fromIssue`/`fromSchemaError`.
- `packages/db/CLAUDE.md` (step 2): table names `workout_session`,
  `workout_set`; a server sync-order column per table; JSON columns for
  `goals`, `constraints`, `availableDays`, `equipment`, `aliases`,
  `muscleGroups`, `targetReps` via `Schema.fromJsonString`.
