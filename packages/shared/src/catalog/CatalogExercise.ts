import { Array as Arr, Option, pipe, Schema } from "effect"
import { Label, Note } from "../common"
import { MuscleGroup } from "../exercise"
import {
  CatalogEquipment,
  CatalogId,
  ExerciseKind,
  IllustrationId,
  MovementPattern,
} from "./taxonomy"

/** A muscle is either primary or secondary; the issue points at the first overlapping secondary. */
const primaryAndSecondaryDisjoint = Schema.makeFilter(
  (v: {
    readonly primaryMuscles: ReadonlyArray<string>
    readonly secondaryMuscles: ReadonlyArray<string>
  }) =>
    pipe(
      v.secondaryMuscles,
      Arr.findFirstIndex((muscle) => v.primaryMuscles.includes(muscle)),
      Option.match({
        onNone: () => true,
        onSome: (i) => ({
          path: ["secondaryMuscles", i],
          issue: "must not repeat a primary muscle",
        }),
      }),
    ),
)

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

export const CatalogExerciseFields = {
  catalogId: CatalogId,
  /** Canonical English gym name. */
  name: Label,
  aliases: Schema.Array(Label).check(Schema.isMaxLength(12)),
  kind: ExerciseKind,
  primaryMuscles: Schema.UniqueArray(MuscleGroup).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(3),
  ),
  secondaryMuscles: Schema.UniqueArray(MuscleGroup).check(Schema.isMaxLength(4)),
  /** Empty = bodyweight. */
  equipment: Schema.UniqueArray(CatalogEquipment).check(Schema.isMaxLength(3)),
  movement: MovementPattern,
  /** 2 to 4 imperative lines. */
  instructions: Schema.Array(Note).check(Schema.isMinLength(2), Schema.isMaxLength(4)),
  illustrationId: IllustrationId,
}

export class CatalogExercise extends Schema.Class<CatalogExercise>(
  "@tanren/shared/CatalogExercise",
)(Schema.Struct(CatalogExerciseFields).check(primaryAndSecondaryDisjoint, aliasesAreDistinct)) {}
export type CatalogExerciseEncoded = (typeof CatalogExercise)["Encoded"]

/** Authoring shape for data modules: `illustrationId` is optional (defaults to `catalogId`). */
export type CatalogExerciseSpec = Omit<CatalogExerciseEncoded, "illustrationId"> & {
  readonly illustrationId?: string
}
