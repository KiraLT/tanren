import { Array as Arr, Option, pipe, Schema } from "effect"
import type { MuscleGroup } from "../exercise"
import { isAvailableWith } from "./availability"
import { CatalogExercise, type CatalogExerciseSpec } from "./CatalogExercise"
import { arms } from "./data/arms"
import { back } from "./data/back"
import { cardio } from "./data/cardio"
import { chest } from "./data/chest"
import { core } from "./data/core"
import { fullBody } from "./data/fullBody"
import { hips } from "./data/hips"
import { legs } from "./data/legs"
import { mobility } from "./data/mobility"
import { shoulders } from "./data/shoulders"
import type { CatalogEquipment, CatalogId, ExerciseKind } from "./taxonomy"

export * from "./availability"
export * from "./CatalogExercise"
export * from "./core30Ids"
export * from "./presets"
export * from "./taxonomy"

/** The data modules in catalog order; the per-module test reads this. */
export const CATALOG_MODULES: ReadonlyArray<{
  readonly name: string
  readonly entries: ReadonlyArray<CatalogExerciseSpec>
}> = [
  { name: "chest", entries: chest },
  { name: "back", entries: back },
  { name: "shoulders", entries: shoulders },
  { name: "arms", entries: arms },
  { name: "legs", entries: legs },
  { name: "hips", entries: hips },
  { name: "core", entries: core },
  { name: "fullBody", entries: fullBody },
  { name: "cardio", entries: cardio },
  { name: "mobility", entries: mobility },
]

const decodeEntry = Schema.decodeUnknownSync(CatalogExercise)

/**
 * Every spec decoded once at module load (module order, then file order): a bad entry throws here,
 * which `catalog.test.ts` turns into a failing test, never a runtime surprise in the app.
 */
export const CATALOG: ReadonlyArray<CatalogExercise> = CATALOG_MODULES.flatMap((module) =>
  module.entries.map((spec) =>
    decodeEntry({ ...spec, illustrationId: spec.illustrationId ?? spec.catalogId }),
  ),
)

export const CATALOG_BY_ID: ReadonlyMap<CatalogId, CatalogExercise> = new Map(
  CATALOG.map((entry) => [entry.catalogId, entry] as const),
)

export const findCatalogExercise = (id: CatalogId): Option.Option<CatalogExercise> =>
  Option.fromNullishOr(CATALOG_BY_ID.get(id))

export interface CatalogFilter {
  readonly query?: string
  readonly muscle?: MuscleGroup
  readonly equipment?: CatalogEquipment
  readonly kind?: ExerciseKind
  /** Only entries doable with this equipment (`isAvailableWith`); absent = no restriction. */
  readonly availableEquipment?: ReadonlyArray<CatalogEquipment>
}

/** 0 exact name, 1 name prefix, 2 alias prefix, 3 substring in name or aliases; none = no match. */
const queryRank = (entry: CatalogExercise, query: string): Option.Option<number> => {
  const name = entry.name.toLowerCase()
  const aliases = entry.aliases.map((alias) => alias.toLowerCase())
  if (query.length === 0 || name === query) return Option.some(0)
  if (name.startsWith(query)) return Option.some(1)
  if (aliases.some((alias) => alias.startsWith(query))) return Option.some(2)
  if (name.includes(query) || aliases.some((alias) => alias.includes(query))) return Option.some(3)
  return Option.none()
}

const matchesFacets = (entry: CatalogExercise, filter: CatalogFilter): boolean =>
  (filter.muscle === undefined ||
    entry.primaryMuscles.includes(filter.muscle) ||
    entry.secondaryMuscles.includes(filter.muscle)) &&
  (filter.equipment === undefined || entry.equipment.includes(filter.equipment)) &&
  (filter.kind === undefined || entry.kind === filter.kind) &&
  (filter.availableEquipment === undefined || isAvailableWith(filter.availableEquipment)(entry))

/** `searchCatalog` over any entry list: the ranking rules, testable without the real data. */
export const searchEntries = (
  entries: ReadonlyArray<CatalogExercise>,
  filter: CatalogFilter,
  limit?: number,
): ReadonlyArray<CatalogExercise> => {
  const query = (filter.query ?? "").trim().toLowerCase()
  const ranked = pipe(
    entries,
    Arr.filter((entry) => matchesFacets(entry, filter)),
    Arr.flatMap((entry) =>
      pipe(
        queryRank(entry, query),
        Option.match({
          onNone: () => [],
          onSome: (rank) => [{ rank, entry }],
        }),
      ),
    ),
  )
  // One pass per rank keeps ties in catalog order without relying on sort stability.
  const ordered = Arr.flatMap([0, 1, 2, 3], (rank) =>
    ranked.filter((item) => item.rank === rank).map((item) => item.entry),
  )
  return limit === undefined ? ordered : Arr.take(ordered, limit)
}

/**
 * Pure and offline. Ranking: exact name > name prefix > alias prefix > substring in name/aliases;
 * case-insensitive; ties keep catalog order; `muscle` matches primary or secondary; an empty filter
 * returns the whole catalog in order.
 */
export const searchCatalog = (
  filter: CatalogFilter,
  limit?: number,
): ReadonlyArray<CatalogExercise> => searchEntries(CATALOG, filter, limit)
