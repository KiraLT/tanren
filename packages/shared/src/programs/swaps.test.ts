import { describe, expect, it } from "@effect/vitest"
import { Array as Arr, Option } from "effect"
import { CATALOG, CATALOG_BY_ID } from "../catalog"
import { CatalogExercise } from "../catalog/CatalogExercise"
import { type CatalogEquipment, CatalogId, type ExerciseKind } from "../catalog/taxonomy"
import { Label } from "../common"
import type { MuscleGroup } from "../exercise"
import type { Swaps } from "../program"
import { CORE30 } from "./core30"
import { applySwaps, SWAP_CANDIDATE_LIMIT, swapCandidates } from "./swaps"

const entry = (id: string): CatalogExercise =>
  Option.getOrThrow(Option.fromNullishOr(CATALOG_BY_ID.get(CatalogId.make(id))))
const ids = (entries: ReadonlyArray<CatalogExercise>) => entries.map((e) => e.catalogId)
const pushUp = entry("push-up")

/** A push-up variant differing only in the ranking keys (fixture: the constructor validates it). */
const synthetic = (
  catalogId: string,
  name: string,
  primary: ReadonlyArray<MuscleGroup>,
  options: {
    readonly secondary?: ReadonlyArray<MuscleGroup>
    readonly equipment?: ReadonlyArray<CatalogEquipment>
    readonly kind?: ExerciseKind
  } = {},
): CatalogExercise =>
  new CatalogExercise({
    ...pushUp,
    catalogId: CatalogId.make(catalogId),
    name: Label.make(name),
    aliases: [],
    kind: options.kind ?? "reps",
    primaryMuscles: primary,
    secondaryMuscles: options.secondary ?? [],
    equipment: options.equipment ?? [],
  })

describe("swapCandidates", () => {
  it("never offers dumbbell-bench-press for a push-up at a bodyweight-only location", () => {
    const offered = ids(swapCandidates(pushUp, CATALOG, Option.some([])))
    expect(offered).not.toContain("dumbbell-bench-press")
    expect(offered.every((id) => entry(id).equipment.length === 0)).toBe(true)
  })

  it("excludes the original, keeps the kind, shares a primary muscle, at most 8", () => {
    const offered = swapCandidates(pushUp, CATALOG, Option.none())
    expect(offered.length).toBeGreaterThan(0)
    expect(offered.length).toBeLessThanOrEqual(SWAP_CANDIDATE_LIMIT)
    expect(ids(offered)).not.toContain("push-up")
    expect(offered.every((e) => e.kind === pushUp.kind)).toBe(true)
    expect(
      offered.every((e) => e.primaryMuscles.some((m) => pushUp.primaryMuscles.includes(m))),
    ).toBe(true)
  })

  it("ranks equal muscle overlap by fewer extra equipment tags, then name", () => {
    const fixture = [entry("incline-push-up"), entry("knee-push-up"), pushUp]
    expect(ids(swapCandidates(pushUp, fixture, Option.none()))).toEqual([
      "knee-push-up",
      "incline-push-up",
    ])
  })

  it("ranks by primary overlap, secondary overlap, extra equipment, name; drops the 9th", () => {
    const original = synthetic("original", "Original", ["chest", "triceps", "shoulders"], {
      secondary: ["core", "forearms", "upperBack", "lats"],
      equipment: ["bench"],
    })
    const fixture = [
      synthetic("p1-s0", "Xray", ["chest"]),
      synthetic("p1-s4", "Aardvark", ["chest"], {
        secondary: ["core", "forearms", "upperBack", "lats"],
      }),
      synthetic("p2-s1", "Aaron", ["chest", "triceps"], { secondary: ["core"] }),
      synthetic("p2-s2-e2", "Able", ["chest", "triceps"], {
        secondary: ["core", "forearms"],
        equipment: ["bench", "barbell", "dumbbell"],
      }),
      synthetic("p2-s2-e1", "Alpha", ["chest", "triceps"], {
        secondary: ["core", "forearms"],
        equipment: ["barbell"],
      }),
      synthetic("p2-s2-charlie", "Charlie", ["chest", "triceps"], {
        secondary: ["core", "forearms"],
        equipment: ["bench"],
      }),
      synthetic("p2-s2-bravo", "Bravo", ["chest", "triceps"], { secondary: ["core", "forearms"] }),
      synthetic("p2-s3", "Yankee", ["chest", "triceps"], {
        secondary: ["core", "forearms", "upperBack"],
      }),
      synthetic("p3-s0", "Zulu", ["chest", "triceps", "shoulders"]),
      synthetic("other-kind", "Aaa Timed", ["chest", "triceps", "shoulders"], { kind: "timed" }),
      synthetic("no-primary", "Aaa Legs", ["quads"]),
      original,
    ]
    expect(ids(swapCandidates(original, fixture, Option.none()))).toEqual([
      "p3-s0",
      "p2-s3",
      "p2-s2-bravo",
      "p2-s2-charlie",
      "p2-s2-e1",
      "p2-s2-e2",
      "p2-s1",
      "p1-s4",
    ])
  })

  it("with no active location (None) offers equipment the original does not use", () => {
    const offered = swapCandidates(pushUp, [entry("incline-push-up")], Option.none())
    expect(ids(offered)).toEqual(["incline-push-up"])
    expect(swapCandidates(pushUp, [entry("incline-push-up")], Option.some([]))).toEqual([])
  })
})

describe("applySwaps", () => {
  const day = Option.getOrThrow(Arr.head(CORE30.days))

  it("is the identity for []", () => {
    expect(applySwaps(day, [])).toBe(day)
  })

  it("maps only the catalogId of the swapped item", () => {
    const [first] = day.items
    const from = Option.getOrThrow(Option.fromNullishOr(first)).catalogId
    const to = CatalogId.make("knee-push-up")
    const swaps: Swaps = [{ from, to }]
    const swapped = applySwaps(day, swaps)
    expect(swapped.items.map((item) => item.catalogId)).toEqual(
      day.items.map((item) => (item.catalogId === from ? to : item.catalogId)),
    )
    expect(swapped.items.map(({ catalogId: _id, ...rest }) => rest)).toEqual(
      day.items.map(({ catalogId: _id, ...rest }) => rest),
    )
    expect({ ...swapped, items: [] }).toEqual({ ...day, items: [] })
  })
})
