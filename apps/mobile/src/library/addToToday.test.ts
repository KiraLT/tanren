import { describe, expect, it } from "@effect/vitest"
import { CatalogId, ExerciseId } from "@tanren/shared"
import { Cause, Effect, Exit, Layer, Ref } from "effect"
import { ExerciseLink } from "../services/ExerciseLink"
import { StoreError } from "../services/SqlDriver"
import { TodayRepo, type TodayRepoShape } from "../services/TodayRepo"
import { addCatalogToToday, addOutcome } from "./addToToday"

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

const describeCause = (cause: Cause.Cause<unknown>) => (Cause.hasFails(cause) ? "store" : "defect")

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
        Ref.update(seen, (xs) => [...xs, `add:${id}`]).pipe(Effect.as(true)),
      )
      const added = yield* addCatalogToToday(catalogId).pipe(
        Effect.provide(Layer.merge(link, repo)),
      )
      expect(added).toBe(true)
      expect(yield* Ref.get(seen)).toEqual([`ensure:plank`, `add:${exerciseId}`])
    }),
  )

  it.effect("does not touch today when the link fails", () =>
    Effect.gen(function* () {
      const calls = yield* Ref.make(0)
      const link = Layer.succeed(
        ExerciseLink,
        ExerciseLink.of({ ensure: () => Effect.fail(new StoreError({ cause: "boom" })) }),
      )
      const repo = todayRepo(() => Ref.update(calls, (n) => n + 1).pipe(Effect.as(true)))
      const exit = yield* Effect.exit(
        addCatalogToToday(catalogId).pipe(Effect.provide(Layer.merge(link, repo))),
      )
      expect(addOutcome(exit, describeCause)).toEqual({ _tag: "Failed", message: "store" })
      expect(yield* Ref.get(calls)).toBe(0)
    }),
  )
})

describe("addOutcome", () => {
  it("true opens Today, false shows the no-session notice, failure carries the copy", () => {
    expect(addOutcome(Exit.succeed(true), describeCause)).toEqual({ _tag: "Added" })
    expect(addOutcome(Exit.succeed(false), describeCause)).toEqual({ _tag: "NoSession" })
    expect(addOutcome(Exit.die("bug"), describeCause)).toEqual({
      _tag: "Failed",
      message: "defect",
    })
  })
})
