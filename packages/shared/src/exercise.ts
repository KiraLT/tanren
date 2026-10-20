import { Array as Arr, Option, pipe, Schema, Struct } from "effect"
import { Label, ROW_COLUMNS, rowFields, Text } from "./common"
import { ExerciseId } from "./ids"

export const MuscleGroup = Schema.Literals([
  "chest",
  "lats",
  "upperBack",
  "lowerBack",
  "traps",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "core",
  "quads",
  "hamstrings",
  "glutes",
  "adductors",
  "calves",
  "fullBody",
  "cardio",
])
export type MuscleGroup = typeof MuscleGroup.Type

/** Aliases are unique case-insensitively and differ from `name`; the issue points at the first offender. */
const aliasesAreDistinct = Schema.makeFilter(
  (v: { readonly name: string; readonly aliases: ReadonlyArray<string> }) => {
    const name = v.name.toLowerCase()
    const aliases = v.aliases.map((alias) => alias.toLowerCase())
    return pipe(
      aliases,
      Arr.findFirstIndex((alias, i) => alias === name || aliases.indexOf(alias) !== i),
      Option.match({
        onNone: () => true,
        onSome: (i) => ({
          path: ["aliases", i],
          issue: "must differ from the name and from the other aliases (case-insensitive)",
        }),
      }),
    )
  },
)

export const ExerciseFields = {
  /** Unique per user among non-deleted exercises, case-insensitive (server, §11.3). */
  name: Label,
  aliases: Schema.Array(Label).check(Schema.isMaxLength(20)),
  /** May be empty: not yet classified. */
  muscleGroups: Schema.UniqueArray(MuscleGroup),
  /** Cues, setup. */
  notes: Schema.OptionFromNullOr(Text),
}

export class Exercise extends Schema.Class<Exercise>("@tanren/shared/Exercise")(
  Schema.Struct({ ...rowFields(ExerciseId), ...ExerciseFields }).check(aliasesAreDistinct),
) {}
export type ExerciseEncoded = (typeof Exercise)["Encoded"]

/** `mapFields` drops struct-level checks, so the alias filter is attached again. */
export const ExerciseInsert = Exercise.mapFields(Struct.omit(ROW_COLUMNS)).check(aliasesAreDistinct)
export type ExerciseInsert = typeof ExerciseInsert.Type

/** Exact partial: absent key = unchanged. Alias rules need the stored row; the server checks them. */
export const ExercisePatch = Exercise.mapFields(Struct.omit(ROW_COLUMNS)).mapFields(
  Struct.map(Schema.optionalKey),
)
export type ExercisePatch = typeof ExercisePatch.Type
