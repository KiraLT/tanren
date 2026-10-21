import { describe, expect, it } from "@effect/vitest"
import { Effect, Option, Schema } from "effect"
import { failingPaths, roundTrips } from "../testing"
import { CatalogExercise, type CatalogExerciseSpec } from "./CatalogExercise"
import {
  CATALOG,
  CATALOG_BY_ID,
  CATALOG_MODULES,
  CatalogEquipment,
  CatalogId,
  CORE30_CATALOG_IDS,
  findCatalogExercise,
  Slug,
  searchCatalog,
  searchEntries,
} from "./index"

const spec = (overrides: Partial<CatalogExerciseSpec>): CatalogExerciseSpec => ({
  catalogId: "plank",
  name: "Plank",
  aliases: [],
  kind: "timed",
  primaryMuscles: ["core"],
  secondaryMuscles: [],
  equipment: [],
  movement: "antiExtension",
  instructions: ["Hold your body straight.", "Breathe steadily."],
  ...overrides,
})

const decode = Schema.decodeUnknownSync(CatalogExercise)
const build = (overrides: Partial<CatalogExerciseSpec>) =>
  decode({ illustrationId: overrides.catalogId ?? "plank", ...spec(overrides) })

const ids = (entries: ReadonlyArray<CatalogExercise>) => entries.map((entry) => entry.catalogId)

const duplicates = (values: ReadonlyArray<string>) =>
  values.filter((value, i) => values.indexOf(value) !== i)

/** Machine, cable and Smith implements (EQ-C); the dedicated stations a location may or may not have. */
const STATION_TAGS: ReadonlyArray<CatalogEquipment> = [
  "smithMachine",
  "legPress",
  "hackSquat",
  "legExtension",
  "legCurl",
  "chestPressMachine",
  "pecDeck",
  "shoulderPressMachine",
  "hipAbductorMachine",
  "calfRaiseMachine",
  "abCrunchMachine",
  "assistedPullUpMachine",
  "cable",
  "latPulldown",
  "seatedRowMachine",
  "backExtensionBench",
  "gluteHamDeveloper",
]

/** The entries that carried the removed coarse `machine` tag, each with its specific implement. */
const FORMER_MACHINE_ENTRIES: ReadonlyArray<readonly [string, CatalogEquipment]> = [
  ["machine-triceps-dip", "dipStation"],
  ["machine-row", "seatedRowMachine"],
  ["machine-high-row", "seatedRowMachine"],
  ["assisted-pull-up", "assistedPullUpMachine"],
  ["machine-chest-press", "chestPressMachine"],
  ["pec-deck", "pecDeck"],
  ["back-extension", "backExtensionBench"],
  ["reverse-hyperextension", "gluteHamDeveloper"],
  ["hip-abduction-machine", "hipAbductorMachine"],
  ["hip-adduction-machine", "hipAbductorMachine"],
  ["hack-squat", "hackSquat"],
  ["leg-press", "legPress"],
  ["single-leg-press", "legPress"],
  ["leg-extension", "legExtension"],
  ["lying-leg-curl", "legCurl"],
  ["seated-leg-curl", "legCurl"],
  ["glute-ham-raise", "gluteHamDeveloper"],
  ["standing-calf-raise", "calfRaiseMachine"],
  ["seated-calf-raise", "calfRaiseMachine"],
  ["donkey-calf-raise", "calfRaiseMachine"],
  ["leg-press-calf-raise", "legPress"],
  ["machine-shoulder-press", "shoulderPressMachine"],
  ["machine-lateral-raise", "shoulderPressMachine"],
  ["reverse-pec-deck", "pecDeck"],
]

describe("catalog data validation", () => {
  it("has 285 to 300 entries, one per module entry", () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(285)
    expect(CATALOG.length).toBeLessThanOrEqual(300)
    expect(CATALOG.length).toBe(CATALOG_MODULES.flatMap((module) => module.entries).length)
  })

  it("has at least 100 entries on a machine, cable or Smith station", () => {
    const stationed = CATALOG.filter((entry) =>
      entry.equipment.some((tag) => STATION_TAGS.includes(tag)),
    )
    expect(stationed.length).toBeGreaterThanOrEqual(100)
  })

  it("retags each former `machine` entry with exactly its specific implement", () => {
    const actual = FORMER_MACHINE_ENTRIES.map(([id]) => [
      id,
      CATALOG_BY_ID.get(CatalogId.make(id))?.equipment,
    ])
    expect(actual).toEqual(FORMER_MACHINE_ENTRIES.map(([id, tag]) => [id, [tag]]))
    // `machine` is no longer a literal, so nothing can still carry it.
    expect(CatalogEquipment.literals.map(String)).not.toContain("machine")
  })

  it("uses every specific machine literal on at least one entry", () => {
    const used = new Set(CATALOG.flatMap((entry) => entry.equipment))
    expect(STATION_TAGS.filter((tag) => !used.has(tag))).toEqual([])
  })

  it("has unique catalogIds", () => {
    expect(duplicates(CATALOG.map((entry) => entry.catalogId))).toEqual([])
    expect(CATALOG_BY_ID.size).toBe(CATALOG.length)
  })

  it("has unique names and aliases across the whole catalog, case-insensitively", () => {
    const labels = CATALOG.flatMap((entry) => [entry.name, ...entry.aliases]).map((label) =>
      label.toLowerCase(),
    )
    expect(duplicates(labels)).toEqual([])
  })

  it.effect("has a slug illustrationId and disjoint muscles on every entry", () =>
    Effect.gen(function* () {
      const paths = yield* Effect.forEach(CATALOG, (entry) =>
        Effect.result(Schema.decodeUnknownEffect(Slug)(entry.illustrationId)),
      )
      expect(paths.filter((result) => result._tag === "Failure")).toEqual([])
      expect(
        CATALOG.filter((entry) =>
          entry.secondaryMuscles.some((muscle) => entry.primaryMuscles.includes(muscle)),
        ).map((entry) => entry.catalogId),
      ).toEqual([])
    }),
  )

  it("defaults illustrationId to the catalogId unless the spec sets one", () => {
    const entry = build({ catalogId: "plank" })
    expect(entry.illustrationId).toBe("plank")
    expect(build({ catalogId: "plank", illustrationId: "front-plank" }).illustrationId).toBe(
      "front-plank",
    )
  })

  it("has all 24 CORE30 ids, each kind timed with core primary", () => {
    expect(CORE30_CATALOG_IDS.length).toBe(24)
    expect(duplicates(CORE30_CATALOG_IDS)).toEqual([])
    const missing = CORE30_CATALOG_IDS.filter((id) => !CATALOG_BY_ID.has(id))
    expect(missing).toEqual([])
    const wrong = CORE30_CATALOG_IDS.flatMap((id) => {
      const found = CATALOG_BY_ID.get(id)
      return found !== undefined &&
        (found.kind !== "timed" || !found.primaryMuscles.includes("core"))
        ? [id]
        : []
    })
    expect(wrong).toEqual([])
  })

  it("keeps every instruction line at 120 characters or fewer", () => {
    const tooLong = CATALOG.flatMap((entry) =>
      entry.instructions
        .filter((line) => line.length > 120)
        .map((line) => `${entry.catalogId}: ${line.length}`),
    )
    expect(tooLong).toEqual([])
  })

  it("has at least 12 entries in every module", () => {
    const small = CATALOG_MODULES.filter((module) => module.entries.length < 12).map(
      (module) => `${module.name}: ${module.entries.length}`,
    )
    expect(small).toEqual([])
  })

  it("ranks the canonical lift first for the common queries", () => {
    expect(searchCatalog({ query: "squat" })[0]?.catalogId).toBe("barbell-back-squat")
    expect(searchCatalog({ query: "ohp" })[0]?.catalogId).toBe("overhead-press")
  })
})

describe("CatalogExercise schema", () => {
  const wire = { ...spec({ aliases: ["Front plank"] }), illustrationId: "plank" }

  it("decodes a valid spec", () => {
    const entry = decode(wire)
    expect(entry).toBeInstanceOf(CatalogExercise)
    expect(entry.aliases).toEqual(["Front plank"])
  })

  it.effect("rejects a muscle that is both primary and secondary, pointing at it", () =>
    Effect.gen(function* () {
      const input = { ...wire, primaryMuscles: ["core"], secondaryMuscles: ["glutes", "core"] }
      expect(yield* failingPaths(CatalogExercise, input)).toEqual([["secondaryMuscles", 1]])
    }),
  )

  it.effect("rejects a duplicate alias and an alias equal to the name", () =>
    Effect.gen(function* () {
      const duplicate = { ...wire, aliases: ["Front plank", "front PLANK"] }
      expect(yield* failingPaths(CatalogExercise, duplicate)).toEqual([["aliases", 1]])
      const sameAsName = { ...wire, aliases: ["PLANK"] }
      expect(yield* failingPaths(CatalogExercise, sameAsName)).toEqual([["aliases", 0]])
    }),
  )

  it.effect("rejects a bad instruction count and an unknown muscle", () =>
    Effect.gen(function* () {
      expect(
        yield* failingPaths(CatalogExercise, { ...wire, instructions: ["Only one."] }),
      ).toEqual([["instructions"]])
      expect(yield* failingPaths(CatalogExercise, { ...wire, primaryMuscles: ["wings"] })).toEqual([
        ["primaryMuscles", 0],
      ])
    }),
  )

  it.effect("round-trips value to wire to value", () => roundTrips(CatalogExercise, decode(wire)))
})

describe("searchEntries ranking", () => {
  const squat = build({ catalogId: "squat", name: "Squat" })
  const prefix = build({ catalogId: "squat-jump", name: "Squat Jump" })
  const aliasPrefix = build({
    catalogId: "knee-bend",
    name: "Knee Bend",
    aliases: ["Squatty bend"],
  })
  const substring = build({ catalogId: "back-squat", name: "Back Squat" })
  const aliasSubstring = build({
    catalogId: "box-sit",
    name: "Box Sit",
    aliases: ["Low squat"],
    primaryMuscles: ["quads"],
    secondaryMuscles: ["core"],
    equipment: ["box"],
    kind: "reps",
  })
  const none = build({ catalogId: "curl", name: "Curl" })
  const all = [none, substring, aliasSubstring, aliasPrefix, prefix, squat]

  it("orders exact name > name prefix > alias prefix > substring (name before alias is a tie)", () => {
    expect(ids(searchEntries(all, { query: "squat" }))).toEqual([
      "squat",
      "squat-jump",
      "knee-bend",
      "back-squat",
      "box-sit",
    ])
  })

  it("is case-insensitive and trims the query", () => {
    expect(ids(searchEntries(all, { query: "  SQUAT " }))[0]).toBe("squat")
  })

  it("keeps catalog order within a rank", () => {
    const first = build({ catalogId: "a-press", name: "A Press" })
    const second = build({ catalogId: "b-press", name: "B Press" })
    expect(ids(searchEntries([second, first], { query: "press" }))).toEqual(["b-press", "a-press"])
  })

  it("filters by muscle (primary or secondary), equipment and kind", () => {
    expect(ids(searchEntries(all, { muscle: "quads" }))).toEqual(["box-sit"])
    expect(ids(searchEntries(all, { muscle: "core", kind: "reps" }))).toEqual(["box-sit"])
    expect(ids(searchEntries(all, { equipment: "box" }))).toEqual(["box-sit"])
    expect(ids(searchEntries(all, { query: "squat", muscle: "core", kind: "timed" }))).toEqual([
      "squat",
      "squat-jump",
      "knee-bend",
      "back-squat",
    ])
  })

  it("returns everything in order for an empty filter and respects limit", () => {
    expect(ids(searchEntries(all, {}))).toEqual(ids(all))
    expect(ids(searchEntries(all, {}, 2))).toEqual(ids(all).slice(0, 2))
    expect(searchEntries(all, { query: "zzz" })).toEqual([])
  })
})

describe("searchCatalog on the catalog", () => {
  it("returns the whole catalog in order for an empty filter", () => {
    expect(ids(searchCatalog({}))).toEqual(ids(CATALOG))
  })

  it("ranks the exact name first and finds aliases", () => {
    const plank = ids(searchCatalog({ query: "plank" }))
    expect(plank[0]).toBe("plank")
    expect(plank).toContain("side-plank")
    expect(ids(searchCatalog({ query: "forearm" }))).toContain("plank")
    expect(ids(searchCatalog({ query: "dead" }))[0]).toBe("dead-bug")
  })

  it("filters by muscle and kind and limits the result", () => {
    expect(ids(searchCatalog({ muscle: "core", kind: "timed" }))).toEqual(
      expect.arrayContaining(["plank", "side-plank", "dead-bug"]),
    )
    expect(searchCatalog({ muscle: "core" }, 1)).toHaveLength(Math.min(1, CATALOG.length))
  })

  it("looks an entry up by id", () => {
    expect(Option.isSome(findCatalogExercise(CatalogId.make("plank")))).toBe(true)
    expect(Option.isNone(findCatalogExercise(CatalogId.make("no-such-exercise")))).toBe(true)
  })
})
