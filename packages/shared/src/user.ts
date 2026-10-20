import { Option, Schema, Struct } from "effect"
import { Email, Label, Note, ROW_COLUMNS, rowFields, Timestamp, TimeZone, Weekday } from "./common"
import { UserId } from "./ids"

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

export const EquipmentKind = Schema.Literals([
  "barbell",
  "dumbbells",
  "kettlebell",
  "rack",
  "bench",
  "cableMachine",
  "machines",
  "smithMachine",
  "trapBar",
  "ezBar",
  "pullUpBar",
  "dipStation",
  "resistanceBands",
  "cardioMachine",
  "bodyweightOnly",
  "other",
])
export type EquipmentKind = typeof EquipmentKind.Type

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

/** `note` is free detail ("adjustable 2×32 kg"), required when `kind` is `other`. */
export const Equipment = Schema.Struct({
  kind: EquipmentKind,
  note: Schema.OptionFromNullOr(Note),
}).check(requiresNoteForOther)
export type Equipment = typeof Equipment.Type

/** Not synced: the auth layer owns writes, so there is no `UserInsert`/`UserPatch`. */
export class User extends Schema.Class<User>("@tanren/shared/User")({
  id: UserId,
  email: Email,
  name: Schema.OptionFromNullOr(Label),
  createdAt: Timestamp,
  updatedAt: Timestamp,
}) {}
export type UserEncoded = (typeof User)["Encoded"]

export const ProfileFields = {
  /** Ordered by priority. */
  goals: Schema.Array(Goal).check(Schema.isMaxLength(10)),
  /** Free-text limitations ("no overhead pressing, left shoulder"). */
  constraints: Schema.Array(Note).check(Schema.isMaxLength(20)),
  availableDays: Schema.UniqueArray(Weekday),
  equipment: Schema.Array(Equipment).check(Schema.isMaxLength(30)),
  /** IANA zone name, used by the server/MCP to compute "today". */
  timezone: TimeZone,
}

/** One per user; invariant `id === userId`, enforced by the server and the D1 primary key. */
export class Profile extends Schema.Class<Profile>("@tanren/shared/Profile")({
  ...rowFields(UserId),
  ...ProfileFields,
}) {}
export type ProfileEncoded = (typeof Profile)["Encoded"]

/** The server sets `id = userId` and the timestamps. */
export const ProfileInsert = Profile.mapFields(Struct.omit(ROW_COLUMNS))
export type ProfileInsert = typeof ProfileInsert.Type

/** Exact partial: absent key = unchanged. */
export const ProfilePatch = Profile.mapFields(Struct.omit(ROW_COLUMNS)).mapFields(
  Struct.map(Schema.optionalKey),
)
export type ProfilePatch = typeof ProfilePatch.Type
