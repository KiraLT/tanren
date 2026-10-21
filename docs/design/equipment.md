# Equipment & locations — design (ADR-0016)

Owner ask (2026-10-21): more gym-machine exercises; pick available equipment in
Settings, per location (home vs gym). Lead decisions are in the brief and
ADR-0016; this note fixes the names engineers code against.

## 1. Taxonomy (FROZEN 2026-10-21 — EQ-C tags against this)

One vocabulary: `CatalogEquipment` in `packages/shared/src/catalog/taxonomy.ts`.
The coarse `machine` tag is **removed**; every entry that carried it is retagged
with the specific machine below. 36 literals, lowerCamel, in six UI groups
(group order = display order; literal order inside a group = display order).

| Group (UI label) | Literals |
| --- | --- |
| Free weights | `barbell` `dumbbell` `kettlebell` `trapBar` `ezBar` `plate` `landmine` `medicineBall` |
| Benches & racks | `bench` `rack` `preacherBench` `backExtensionBench` `gluteHamDeveloper` `box` |
| Machines | `smithMachine` `legPress` `hackSquat` `legExtension` `legCurl` `chestPressMachine` `pecDeck` `shoulderPressMachine` `hipAbductorMachine` `calfRaiseMachine` `abCrunchMachine` `assistedPullUpMachine` |
| Cables | `cable` `latPulldown` `seatedRowMachine` |
| Bodyweight & accessories | `pullUpBar` `dipStation` `band` `abWheel` `foamRoller` `suspensionTrainer` |
| Cardio | `cardioMachine` |

New vs today: `rack`, `preacherBench`, `backExtensionBench`, `gluteHamDeveloper`,
`legPress`, `hackSquat`, `legExtension`, `legCurl`, `chestPressMachine`, `pecDeck`,
`shoulderPressMachine`, `hipAbductorMachine`, `calfRaiseMachine`, `abCrunchMachine`,
`assistedPullUpMachine`, `latPulldown`, `seatedRowMachine` (17 added, `machine` removed).

Tagging rules (EQ-C):
- `equipment` lists what the gym must physically have; max 3 tags (unchanged check).
- `rack` = squat/power rack or half rack. Tag it on barbell back/front squats,
  rack pulls, barbell bench press from a rack is `bench` + `barbell` only (a
  flat bench with uprights is assumed by `bench`); overhead press from the floor
  needs no rack.
- `cable` = any cable station / functional trainer / crossover. `latPulldown` and
  `seatedRowMachine` are their own stations (a functional trainer can do neither
  at full load); a lat pulldown done on a functional trainer is still `cable`.
- `legCurl` covers lying, seated and standing leg curl machines.
- `calfRaiseMachine` covers seated, standing and donkey machines; a calf raise on
  the leg press is `legPress`; on a Smith is `smithMachine`.
- `backExtensionBench` = 45°/90° hyperextension bench; `gluteHamDeveloper` = GHD /
  reverse hyper. `preacherBench` for preacher/Scott curls (add `ezBar` or `dumbbell`).
- `pecDeck` covers pec deck and its rear-delt (reverse) setting.
- `hipAbductorMachine` covers abduction and adduction machines.
- `assistedPullUpMachine` for assisted pull-ups / dips on the counterweight machine.
- `cardioMachine` stays one tag (treadmill, bike, rower, ski-erg).
- Bodyweight = empty array (unchanged). `plate` only when the plate is the load.

Retag map for the 19 existing `machine` entries: Leg Press, Single-Leg Press,
Leg Press Calf Raise → `legPress`; Hack Squat → `hackSquat`; Leg Extension →
`legExtension`; Lying/Seated Leg Curl → `legCurl`; Hip Abduction/Adduction Machine
→ `hipAbductorMachine`; Back Extension → `backExtensionBench`; Glute-Ham Raise,
Reverse Hyperextension → `gluteHamDeveloper`; Seated/Standing/Donkey Calf Raise →
`calfRaiseMachine`; Machine High Row → `seatedRowMachine`; Machine Lateral Raise →
`cable` (no dedicated literal; lateral-raise machines are rare — VERIFY with EQ-C,
else retag `dumbbell`); Machine Shoulder Press → `shoulderPressMachine`; Machine
Triceps Dip → `dipStation`.

Presets (`packages/shared/src/catalog/presets.ts`, see §2):
- `commercialGym`: every literal above (all 36).
- `home`: `dumbbell` `kettlebell` `bench` `pullUpBar` `band`.
- `bodyweightOnly`: `[]`.

A home gym (dumbbell + bench + pullUpBar) and a commercial gym differ on every
machine, cable and barbell literal, which is the distinction the owner asked for.

## 2. Data model (`packages/shared`, task EQ-1)

`ids.ts` — after `ProgramDayCompletionId`:
```ts
export const LocationId = Uuid.pipe(Schema.brand("LocationId"))
export type LocationId = typeof LocationId.Type
```

`user.ts` — **delete** `EquipmentKind`, `Equipment`, `ProfileFields.equipment`
(`requiresNoteForOther` stays for `Goal`). Add:
```ts
import { CatalogEquipment } from "./catalog/taxonomy"
import { LocationId, UserId } from "./ids"

/** A place the user trains and what it has (ADR-0016). `equipment: []` = bodyweight only. */
export const Location = Schema.Struct({
  id: LocationId,
  name: Label,                                  // common.ts:37 Label (1..80, trimmed)
  equipment: Schema.UniqueArray(CatalogEquipment),
})
export type Location = typeof Location.Type

/** `activeLocationId` must name one of `locations`; the issue points at `activeLocationId`. */
const activeLocationExists = Schema.makeFilter(
  (v: { readonly locations: ReadonlyArray<{ readonly id: string }>; readonly activeLocationId: Option.Option<string> }) =>
    Option.match(v.activeLocationId, {
      onNone: () => true,
      onSome: (id) => v.locations.some((l) => l.id === id) || { path: ["activeLocationId"], issue: "not one of locations" },
    }),
)
/** Location ids are unique; the issue points at `locations`. */
const uniqueLocationIds = Schema.makeFilter(
  (v: { readonly locations: ReadonlyArray<{ readonly id: string }> }) =>
    new Set(v.locations.map((l) => l.id)).size === v.locations.length || { path: ["locations"], issue: "duplicate location id" },
)

export const ProfileFields = {
  goals: …, constraints: …, availableDays: …,          // unchanged
  /** Where the user trains; ≤ 10. Replaces `equipment` (legacy column, §3). */
  locations: Schema.Array(Location).check(Schema.isMaxLength(10)),
  /** The location the app filters by; `None` = everything is available. */
  activeLocationId: Schema.OptionFromNullOr(LocationId),
  timezone: TimeZone,
}
```
`Profile` is a `Schema.Class`; apply `activeLocationExists` and `uniqueLocationIds` to it.
VERIFY (installed `effect` types): whether `Schema.Class<Profile>("…")({...}).check(f)` is
legal in Effect 4.0.5; if not, apply both filters in `ProfileInsert`/`ProfilePatch`-consuming
code paths instead: worker `update_profile` (`invalid(msg, ["activeLocationId"])`) and mobile
`ProfileRepo.save`. `ProfileInsert`/`ProfilePatch` derive unchanged. The wire `Profile` no
longer has `equipment`; an old client row that still sends it is an excess property
(ignored by default decode — VERIFY `onExcessProperty` default in the sync decode path).

`catalog/presets.ts` (new, EQ-1; `satisfies` makes EQ-C's final literal list a compile check):
```ts
export const EquipmentGroup = Schema.Literals(["freeWeights", "benchesRacks", "machines", "cables", "bodyweightAccessories", "cardio"])
export type EquipmentGroup = typeof EquipmentGroup.Type
export const EQUIPMENT_GROUP_LABEL: { readonly [G in EquipmentGroup]: string } = { freeWeights: "Free weights", benchesRacks: "Benches & racks", machines: "Machines", cables: "Cables", bodyweightAccessories: "Bodyweight & accessories", cardio: "Cardio" }
/** Every literal in exactly one group; order within a group = display order (§1 table). */
export const EQUIPMENT_GROUPS: { readonly [G in EquipmentGroup]: ReadonlyArray<CatalogEquipment> } = { … §1 … }
export const LocationPreset = Schema.Literals(["commercialGym", "home", "bodyweightOnly"])
export const LOCATION_PRESETS: { readonly [P in LocationPreset]: { readonly name: string; readonly equipment: ReadonlyArray<CatalogEquipment> } } =
  { commercialGym: { name: "Gym", equipment: CatalogEquipment.literals }, home: { name: "Home", equipment: ["dumbbell","kettlebell","bench","pullUpBar","band"] }, bodyweightOnly: { name: "Anywhere", equipment: [] } }
```
VERIFY: the literal array accessor on `Schema.Literals` (`.literals`) in Effect 4.0.5; else
spell the 36 out and test `equals(new Set(all), new Set(CatalogEquipment literals))`.

`row.ts` — `ProfileRow`: replace the `equipment` line with
```ts
  locations: jsonColumn(Profile.fields.locations),
  activeLocationId: wire (string | null) — already covered by `wireRecord`, no jsonColumn
```
Legacy column: D1 and the local store keep `equipment TEXT NOT NULL` (§3). The encoded record
must therefore still carry `equipment: "[]"`. Preferred: a transformation on `ProfileRow`'s
`decodeTo(Profile)` that drops `equipment` on decode and adds `"[]"` on encode (VERIFY the
Effect 4 `Schema.decodeTo(to, Transformation)` signature in installed types). Fallback: the two
writers add it — `packages/db` `ProfileRepo.put` (ROW_KEYS.profile + `equipment`) and mobile
`LocalStore.write` for table `profile`. Record which was used in the EQ-1 report.

`dataExport.ts`: carries the profile row unchanged (new fields flow through `Profile`).

## 3. Migration 0003 (`packages/db`, EQ-1)

`packages/db/src/schema/user.ts` (profile table): keep `equipment: text("equipment").notNull()`
with the comment `/** Legacy (pre-ADR-0016); always "[]". Dropped in a later rebuild. */`; add
```ts
    locations: text("locations").notNull().default("[]"),
    activeLocationId: text("active_location_id"),
```
`packages/db/migrations/0003_locations.sql` (generated with the repo's drizzle-kit script; must be exactly):
```sql
ALTER TABLE `profile` ADD `locations` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `profile` ADD `active_location_id` text;
```
plus `meta/0003_snapshot.json` and the `_journal.json` entry. No DROP COLUMN, no table rebuild.
Seed (`packages/db/src/seed/month.ts`): the seeded profile gets two locations ("Gym" =
commercialGym preset, "Home" = home preset) and `activeLocationId` = Gym.

Mobile store `apps/mobile/src/store/migrations.ts` — append `v3`:
```ts
const v3: ReadonlyArray<string> = [
  `ALTER TABLE "profile" ADD COLUMN "locations" TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE "profile" ADD COLUMN "activeLocationId" TEXT`,
]
export const MIGRATIONS = [v1, v2, v3]
```

## 4. Availability rule (`packages/shared/src/catalog/availability.ts`, EQ-1)

```ts
/** Available when every implement the entry needs is at the location; `[]` (bodyweight) always is. */
export const isAvailableWith = (available: ReadonlyArray<CatalogEquipment>) =>
  (entry: Pick<CatalogExercise, "equipment">): boolean => entry.equipment.every((e) => available.includes(e))
/** What the location lacks for this entry, in the entry's tag order; `[]` when available. */
export const missingEquipment = (entry: Pick<CatalogExercise, "equipment">, location: Location): ReadonlyArray<CatalogEquipment>
/** `None` active location → `None` (everything available). */
export const activeLocation = (profile: Profile): Option.Option<Location>
```
`CatalogFilter` (catalog/index.ts:56) gains `readonly availableEquipment?: ReadonlyArray<CatalogEquipment>`;
`matchesFacets` applies `isAvailableWith` when set. `searchCatalog` otherwise unchanged.

## 5. MCP (`packages/shared/src/mcp.ts` + `apps/worker/src/mcp/`, EQ-1)

New read tool **`get_profile`** (6th read; `MCP_TOOLS` read slice becomes `slice(0, 6)`):
```ts
export const GetProfileInput = Schema.Struct({})
export const GetProfileResult = Schema.OptionFromNullOr(Profile)   // None until update_profile created it
MCP_TOOLS = ["get_overview","get_exercise_history","list_sessions","get_current_plan","search_exercises","get_profile","write_plan_week","log_session","update_profile"]
```
Worker: `tools.ts` adds `getProfile` (1 D1 statement via `ProfileRepo.get`), description
"Training profile: goals, constraints, availableDays, locations (each with its equipment),
activeLocationId, timezone." `update_profile`: description lists `locations` and
`activeLocationId` (patch semantics unchanged; the `onNone` default adds `locations: [],
activeLocationId: Option.none()` and drops `equipment: []`).

`search_exercises`:
```ts
  availableAt: Schema.optionalKey(Schema.Union([LocationId, Schema.Literal("active")])),
```
`"active"` = the profile's `activeLocationId` (no active location → no filter); a `LocationId`
not in the profile → `NotFound` (existing ToolError). Sets `CatalogFilter.availableEquipment`.
With `availableAt` set the tool runs 1 D1 statement (was 0; update the comment at mcp.ts:187).
`CatalogMatch` unchanged. docs/design/mcp.md §3 code block, §4 counts → **6 read + 3 write =
9**, a read-only grant lists 6; one wire example for `get_profile`.

## 6. Mobile (`apps/mobile`, EQ-2)

New `src/services/ProfileRepo.ts` (+ `.test.ts`, Context.Service, pattern of `PlanWeekRepo`):
```ts
interface ProfileRepoShape {
  readonly get: Effect.Effect<Option.Option<Profile>, StoreError>
  /** Upserts the whole row dirty (synced by SyncEngine). Creates the profile when none exists:
      goals/constraints/availableDays [], timezone = device zone, id = userId = CurrentUser. */
  readonly save: (patch: ProfilePatch) => Effect.Effect<Profile, StoreError | ProfileInvalid>
}
```
`ProfileInvalid` is a `Data.TaggedError` (internal) carrying the schema issue. `runtime.ts`: one layer line.
`src/hooks/useProfile.ts`: `Option<Profile>` re-read on `StoreEvents` for table `profile`.

Pure state `src/components/settings/locationsState.ts` (+test): `LocationsAction` =
`AddPreset{preset}` (name from `LOCATION_PRESETS`, id from `IdGenerator`), `Rename{id,name}`,
`Toggle{id,equipment}`, `Remove{id}` (removing the active one clears `activeLocationId`),
`SetActive{id}`; reducer over `Pick<Profile,"locations"|"activeLocationId">`; first added
location becomes active.

UI (all through the `src/ui` barrel; tokens only): `EquipmentSection.tsx` in Settings
(`ListRow` per location, `StatusPill` "Active", trailing "Edit"; footer `Button`s "Add gym",
"Add home", "Add bodyweight"); route `app/settings/location/[id].tsx` (`LocationEditor.tsx`:
name field, six groups of toggle chips in `EQUIPMENT_GROUPS` order with `facetLabel`, "Set
active", "Delete"). `app/settings.tsx` renders `EquipmentSection` between Account and Appearance.

Library: `searchState.ts` gains `atLocation: boolean` (initial `true`) and action
`AtLocation{value}`; `toFilter(state, active: Option<Location>)` adds `availableEquipment` when
`atLocation && Some`; `hasFilter` excludes `atLocation`. `CatalogFilterBar`: leading chip
"At <name>" toggling it (hidden when no active location). `CatalogDetail`: when unavailable, a
muted line `Needs: <facetLabel(missing).join(", ")>` under the equipment line. Facet label for
the 17 new literals comes from `humanize` (VERIFY output for `pecDeck`, `ezBar`; add overrides
to `catalogFormat.ts` if ugly).

Today: `src/components/TodaySetupCard.tsx` ("Set up your equipment — tell Tanren what your gym
has", `Button` → `/settings`), rendered at the top of `TodayReady` while
`profile.locations.length === 0` (also when no profile). INT-X3: `addCatalogToToday` already
returns `false` when the exercise is in today's session; `CatalogDetail` shows "Already in
today's session" (muted `Text`, 3 s) on `false` and "Added" on `true`.

## 7. Tests to require (rules in `.claude/rules/tests.md`)

shared: `Location`, `Profile` (new checks: active id not in locations → path `activeLocationId`;
duplicate ids → path `locations`; 11 locations → fail), `ProfileRow` round-trip (record →
Profile → record, encoded record contains `equipment: "[]"`), `GetProfileResult`,
`SearchExercisesInput.availableAt` decode-ok (`"active"`, a UUID) / fail (`"gym"`);
`availability.test.ts`: bodyweight always available; subset ok; one missing → listed;
`activeLocation` None cases; `presets.test.ts`: every `CatalogEquipment` literal in exactly one
group; `commercialGym` = all; `home` as §1. `catalog.test.ts`: no entry carries `machine` (the
literal is gone, so this is the compile).
db: `Profile.test.ts` — put/get with two locations + active; migration applies on a fresh D1
(TestLayer); legacy `equipment` column reads `'[]'`.
worker: `tools.test.ts` — `get_profile` None/Some; `search_exercises availableAt:"active"`
filters by the seeded profile, unknown id → NotFound, no active location → unfiltered;
`update_profile` with `locations` + bad `activeLocationId` → ValidationError path.
mobile: `ProfileRepo.test.ts` (create-on-first-save sets device tz; save marks dirty);
`locationsState.test.ts` (each action; remove-active clears); `searchState.test.ts`
(`atLocation` → `availableEquipment`; `hasFilter` ignores it); `migrations` v3 applies on a v2 DB.
