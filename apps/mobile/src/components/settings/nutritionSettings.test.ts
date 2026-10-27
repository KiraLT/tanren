import { describe, expect, it } from "@effect/vitest"
import { NutritionProfile } from "@tanren/shared"
import { DateTime, Effect, Layer, Option, Result, Schema } from "effect"
import { CurrentUser } from "../../services/CurrentUser"
import { LocalStore } from "../../services/LocalStore"
import { ProfileRepo } from "../../services/ProfileRepo"
import { StoreError } from "../../services/SqlDriver"
import { nodeSqlDriverLayer } from "../../services/SqlDriver.testing"
import { StoreEvents } from "../../services/StoreEvents"
import {
  canSave,
  defaultDraft,
  type NutritionDraft,
  saveNutrition,
  stepValue,
  validateDraft,
} from "./nutritionSettings"

const TestLayer = ProfileRepo.layer.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      LocalStore.layerNoDeps.pipe(
        Layer.provideMerge(Layer.mergeAll(nodeSqlDriverLayer, StoreEvents.layer)),
      ),
      CurrentUser.layerTest(Option.none()),
      DateTime.layerCurrentZoneNamed("Europe/Vilnius").pipe(Layer.orDie),
    ),
  ),
)

const draft: NutritionDraft = {
  goal: "gain_muscle",
  bodyWeightKg: 85,
  heightCm: Option.some(180),
  birthYear: Option.some(1990),
  sex: Option.some("male"),
  activityLevel: "moderate",
  eatBackActive: false,
  kcalTarget: Option.none(),
  proteinTargetG: Option.none(),
}

const valid = (input: NutritionDraft) =>
  Result.getOrThrowWith(validateDraft(input), (error) => new Error(error.message))

describe("validateDraft", () => {
  it("round-trips a draft through the wire encoding", () => {
    const profile = valid(draft)
    const encoded = Schema.encodeSync(NutritionProfile)(profile)
    expect(encoded).toMatchObject({ heightCm: 180, kcalTarget: null, eatBackActive: false })
    expect(Schema.decodeUnknownSync(NutritionProfile)(encoded)).toEqual(profile)
  })

  it.each([29.5, 300.5])("rejects a body weight of %d and names the field", (bodyWeightKg) => {
    const result = validateDraft({ ...draft, bodyWeightKg })
    expect(Result.isFailure(result)).toBe(true)
    const paths = Result.match(result, {
      onFailure: (error) => error.issues.map((issue) => issue.path.join(".")),
      onSuccess: () => [],
    })
    expect(paths).toContain("bodyWeightKg")
  })

  it("keeps an unset height as None and eat-back off by default", () => {
    const profile = valid(defaultDraft)
    expect(profile.heightCm).toEqual(Option.none())
    expect(profile.eatBackActive).toBe(false)
  })
})

describe("stepValue", () => {
  it("snaps to the step grid, then clamps", () => {
    expect(stepValue("kcalTarget", 3070, -1)).toBe(3050)
    expect(stepValue("kcalTarget", 3070, 1)).toBe(3100)
    expect(stepValue("bodyWeightKg", 30, -1)).toBe(30)
    expect(stepValue("bodyWeightKg", 85, 1)).toBe(85.5)
    expect(stepValue("proteinTargetG", 500, 1)).toBe(500)
  })
})

describe("canSave", () => {
  it("is true only for a valid draft that differs from the stored one", () => {
    expect(canSave(draft, Option.none())).toBe(true)
    expect(canSave(draft, Option.some(valid(draft)))).toBe(false)
    expect(canSave({ ...draft, eatBackActive: true }, Option.some(valid(draft)))).toBe(true)
    expect(canSave({ ...draft, bodyWeightKg: 301 }, Option.none())).toBe(false)
  })
})

describe("saveNutrition", () => {
  it.effect("stores Some on the profile and None clears it", () =>
    Effect.gen(function* () {
      const profile = valid(draft)
      yield* saveNutrition(Option.some(profile))
      const stored = yield* ProfileRepo.use((repo) => repo.get)
      expect(Option.flatMap(stored, (found) => found.nutrition)).toEqual(Option.some(profile))
      yield* saveNutrition(Option.none())
      const cleared = yield* ProfileRepo.use((repo) => repo.get)
      expect(Option.map(cleared, (found) => found.nutrition)).toEqual(Option.some(Option.none()))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("surfaces a ProfileRepo failure as the typed error", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(saveNutrition(Option.some(valid(draft))))
      expect(error).toMatchObject({ _tag: "StoreError" })
    }).pipe(
      Effect.provide(
        Layer.succeed(
          ProfileRepo,
          ProfileRepo.of({
            get: Effect.succeed(Option.none()),
            save: () => Effect.fail(new StoreError({ cause: "disk full" })),
            modify: () => Effect.fail(new StoreError({ cause: "disk full" })),
          }),
        ),
      ),
    ),
  )
})
