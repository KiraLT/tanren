import { Effect, Option, Schema, Struct } from "effect"
import { CatalogEquipment } from "./catalog/taxonomy"
import { Email, Label, Note, ROW_COLUMNS, rowFields, Timestamp, TimeZone, Weekday } from "./common"
import { LocationId, UserId } from "./ids"

export const GoalKind = Schema.Literals([
  "strength",
  "hypertrophy",
  "endurance",
  "fatLoss",
  "mobility",
  "generalFitness",
  "sport",
  "other",
])
export type GoalKind = typeof GoalKind.Type

/** `kind: "other"` needs a note saying what it is; the issue points at `note`. */
const requiresNoteForOther = Schema.makeFilter(
  (v: { readonly kind: string; readonly note: Option.Option<string> }) =>
    v.kind !== "other" ||
    Option.isSome(v.note) || { path: ["note"], issue: 'required when kind is "other"' },
)

export const Goal = Schema.Struct({
  kind: GoalKind,
  note: Schema.OptionFromNullOr(Note),
}).check(requiresNoteForOther)
export type Goal = typeof Goal.Type

/** Not synced: the auth layer owns writes, so there is no `UserInsert`/`UserPatch`. */
export class User extends Schema.Class<User>("@tanren/shared/User")({
  id: UserId,
  email: Email,
  name: Schema.OptionFromNullOr(Label),
  createdAt: Timestamp,
  updatedAt: Timestamp,
}) {}
export type UserEncoded = (typeof User)["Encoded"]

/** A place the user trains and what it has (ADR-0016). `equipment: []` = bodyweight only. */
export const Location = Schema.Struct({
  id: LocationId,
  name: Label,
  equipment: Schema.UniqueArray(CatalogEquipment),
})
export type Location = typeof Location.Type

/** At most 10 locations (equipment.md §2); the row codec's JSON column uses this too. */
export const Locations = Schema.Array(Location).check(Schema.isMaxLength(10))

/** `activeLocationId` must name one of `locations`; the issue points at `activeLocationId`. */
const activeLocationExists = Schema.makeFilter(
  (v: {
    readonly locations: ReadonlyArray<{ readonly id: string }>
    readonly activeLocationId: Option.Option<string>
  }) =>
    Option.match(v.activeLocationId, {
      onNone: () => true,
      onSome: (id) =>
        v.locations.some((location) => location.id === id) || {
          path: ["activeLocationId"],
          issue: "not one of locations",
        },
    }),
)

/** Location ids are unique; the issue points at `locations`. */
const uniqueLocationIds = Schema.makeFilter(
  (v: { readonly locations: ReadonlyArray<{ readonly id: string }> }) =>
    new Set(v.locations.map((location) => location.id)).size === v.locations.length || {
      path: ["locations"],
      issue: "duplicate location id",
    },
)

// Nutrition (ADR-0025, nutrition.md §1)

export const NutritionGoal = Schema.Literals(["gain_muscle", "lose_weight", "maintain"])
export type NutritionGoal = typeof NutritionGoal.Type

export const ActivityLevel = Schema.Literals(["sedentary", "light", "moderate", "active", "extra"])
export type ActivityLevel = typeof ActivityLevel.Type

export const Sex = Schema.Literals(["male", "female"])
export type Sex = typeof Sex.Type

/**
 * An optional fact: the key may be absent or `null` on the wire (both decode to `None`, `None`
 * encodes to `null`), and constructors default it to `None` (same idiom as `activeLocationId`).
 */
const optionalFact = <S extends Schema.Top>(schema: S) =>
  Schema.OptionFromOptionalNullOr(schema, { onNoneEncoding: null }).pipe(
    Schema.withConstructorDefault(Effect.succeed(Option.none())),
  )

export const NutritionProfile = Schema.Struct({
  goal: NutritionGoal,
  bodyWeightKg: Schema.Number.check(Schema.isBetween({ minimum: 30, maximum: 300 })),
  heightCm: optionalFact(Schema.Number.check(Schema.isBetween({ minimum: 120, maximum: 230 }))),
  birthYear: optionalFact(Schema.Int.check(Schema.isBetween({ minimum: 1920, maximum: 2020 }))),
  sex: optionalFact(Sex),
  activityLevel: ActivityLevel,
  /** ADR-0025 §1: add Garmin `activeCalories` to the day's budget (floored at 0). Default false. */
  eatBackActive: Schema.Boolean.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(false)),
    Schema.withConstructorDefault(Effect.succeed(false)),
  ),
  /** Manual overrides; `None` = derived by `nutritionTargets` (nutrition.md §4). */
  kcalTarget: optionalFact(Schema.Int.check(Schema.isBetween({ minimum: 800, maximum: 8000 }))),
  proteinTargetG: optionalFact(Schema.Int.check(Schema.isBetween({ minimum: 20, maximum: 500 }))),
})
export type NutritionProfile = typeof NutritionProfile.Type

export const ProfileFields = {
  /** Ordered by priority. */
  goals: Schema.Array(Goal).check(Schema.isMaxLength(10)),
  /** Free-text limitations ("no overhead pressing, left shoulder"). */
  constraints: Schema.Array(Note).check(Schema.isMaxLength(20)),
  availableDays: Schema.UniqueArray(Weekday),
  /**
   * Where the user trains; ≤ 10 (ADR-0016). Replaces the pre-v3 `equipment` list (its D1/SQLite
   * column is legacy, see `ProfileRow`). A missing key decodes as `[]` and the constructors
   * default to `[]`: a pre-v3 client pushing a profile row without the key still syncs
   * (pattern: `Exercise.catalogId`).
   */
  locations: Locations.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed([])),
    Schema.withConstructorDefault(Effect.succeed([])),
  ),
  /** The location the app filters by; `None` = everything is available. Missing key = `None`. */
  activeLocationId: Schema.OptionFromOptionalNullOr(LocationId, { onNoneEncoding: null }).pipe(
    Schema.withConstructorDefault(Effect.succeed(Option.none())),
  ),
  /** IANA zone name, used by the server/MCP to compute "today". */
  timezone: TimeZone,
  /** Nutrition goal and body facts; `None` = tracking off. Missing key = `None` (pre-v6 peers). */
  nutrition: Schema.OptionFromOptionalNullOr(NutritionProfile, { onNoneEncoding: null }).pipe(
    Schema.withConstructorDefault(Effect.succeed(Option.none())),
  ),
}

/** One per user; invariant `id === userId`, enforced by the server and the D1 primary key. */
export class Profile extends Schema.Class<Profile>("@tanren/shared/Profile")(
  Schema.Struct({ ...rowFields(UserId), ...ProfileFields }).check(
    uniqueLocationIds,
    activeLocationExists,
  ),
) {}
export type ProfileEncoded = (typeof Profile)["Encoded"]

/** The server sets `id = userId` and the timestamps. */
export const ProfileInsert = Profile.mapFields(Struct.omit(ROW_COLUMNS))
export type ProfileInsert = typeof ProfileInsert.Type

/**
 * Exact partial: absent key = unchanged. Built from the bare field schemas, not by mapping
 * `ProfileFields`: `locations` and `activeLocationId` carry decoding defaults (`[]`, `None`) that
 * would turn an absent key into "clear it" and wipe the stored locations on every patch.
 * `activeLocationId: null` clears the active location.
 */
export const ProfilePatch = Schema.Struct({
  goals: Schema.optionalKey(ProfileFields.goals),
  constraints: Schema.optionalKey(ProfileFields.constraints),
  availableDays: Schema.optionalKey(ProfileFields.availableDays),
  locations: Schema.optionalKey(Locations),
  activeLocationId: Schema.optionalKey(Schema.OptionFromNullOr(LocationId)),
  timezone: Schema.optionalKey(ProfileFields.timezone),
  /** `null` turns nutrition tracking off. */
  nutrition: Schema.optionalKey(Schema.OptionFromNullOr(NutritionProfile)),
})
export type ProfilePatch = typeof ProfilePatch.Type
