import { describe, expect, it } from "@effect/vitest"
import { CatalogId, ExerciseId } from "@tanren/shared"
import { Effect, Layer, Ref } from "effect"
import { addCatalogToToday } from "./addCatalogToToday"
import { ExerciseLink } from "./ExerciseLink"
import { StoreError } from "./SqlDriver"
import { TodayRepo, type TodayRepoShape } from "./TodayRepo"

const catalogId = CatalogId.make("plank")
const exerciseId = ExerciseId.make("00000000-0000-4000-8000-000000000042")

/** Only `addExercise` is reachable from `addCatalogToToday`; the rest die if ever called. */
const todayRepo = (addExercise: TodayRepoShape["addExercise"]) =>
  Layer.succeed(
    TodayRepo,
    TodayRepo.of(
      new Proxy({ addExercise } satisfies Partial<TodayRepoShape>, {
        get: (target, key) =>
          key === "addExercise"
            ? target.addExercise
            : () => Effect.die(`unexpected ${String(key)}`),
      }) as TodayRepoShape, // the proxy answers every other member with a dying stub
    ),
  )

describe("addCatalogToToday", () => {
  it.effect("links the catalog entry, then adds that exercise to today", () =>
    Effect.gen(function* () {
      const seen = yield* Ref.make<ReadonlyArray<string>>([])
      const link = Layer.succeed(
        ExerciseLink,
        ExerciseLink.of({
          ensure: (id) =>
            Ref.update(seen, (xs) => [...xs, `ensure:${id}`]).pipe(Effect.as(exerciseId)),
        }),
      )
      const repo = todayRepo((id) =>
        Ref.update(seen, (xs) => [...xs, `add:${id}`]).pipe(Effect.as("added" as const)),
      )
      const added = yield* addCatalogToToday(catalogId).pipe(
        Effect.provide(Layer.merge(link, repo)),
      )
      expect(added).toBe("added")
      expect(yield* Ref.get(seen)).toEqual([`ensure:plank`, `add:${exerciseId}`])
    }),
  )

  it.effect.each(["noSession", "alreadyPlanned"] as const)("passes on %s unchanged", (result) =>
    Effect.gen(function* () {
      const link = Layer.succeed(
        ExerciseLink,
        ExerciseLink.of({ ensure: () => Effect.succeed(exerciseId) }),
      )
      const added = yield* addCatalogToToday(catalogId).pipe(
        Effect.provide(
          Layer.merge(
            link,
            todayRepo(() => Effect.succeed(result)),
          ),
        ),
      )
      expect(added).toBe(result)
    }),
  )

  it.effect("fails with the StoreError and does not touch today when the link fails", () =>
    Effect.gen(function* () {
      const calls = yield* Ref.make(0)
      const link = Layer.succeed(
        ExerciseLink,
        ExerciseLink.of({ ensure: () => Effect.fail(new StoreError({ cause: "boom" })) }),
      )
      const repo = todayRepo(() =>
        Ref.update(calls, (n) => n + 1).pipe(Effect.as("added" as const)),
      )
      const error = yield* Effect.flip(
        addCatalogToToday(catalogId).pipe(Effect.provide(Layer.merge(link, repo))),
      )
      expect(error).toMatchObject({ _tag: "StoreError" })
      expect(yield* Ref.get(calls)).toBe(0)
    }),
  )
})
