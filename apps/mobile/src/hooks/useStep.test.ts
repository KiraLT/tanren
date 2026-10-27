import { describe, expect, it } from "@effect/vitest"
import { CatalogId } from "@tanren/shared"
import { Effect, Fiber, Layer, Option, Ref, Stream } from "effect"
import { vi } from "vitest"
import { StoreError } from "../services/SqlDriver"
import { type StepKey, StepRepo } from "../services/StepRepo"
import { StoreEvents } from "../services/StoreEvents"
import { overrideChanges } from "./useStep"

// The app runtime pulls in Expo modules that need `__DEV__`; this test provides its own layers.
vi.mock("../services/runtime", () => ({ runtime: {} }))

const key: StepKey = `catalog:${CatalogId.make("bench-press")}`

describe("overrideChanges", () => {
  it.effect("emits None for a failed read and keeps re-reading on later store changes", () =>
    Effect.gen(function* () {
      const reads = yield* Ref.make(0)
      const repo = Layer.succeed(
        StepRepo,
        StepRepo.of({
          // The first read fails, every later one finds the override.
          get: () =>
            Ref.getAndUpdate(reads, (n) => n + 1).pipe(
              Effect.flatMap((n) =>
                n === 0
                  ? Effect.fail(new StoreError({ cause: "disk" }))
                  : Effect.succeed(Option.some(1.25)),
              ),
            ),
          set: () => Effect.void,
          clear: () => Effect.void,
        }),
      )
      const program = Effect.gen(function* () {
        const changes = yield* overrideChanges(key)
        const fiber = yield* Effect.forkChild(Stream.runCollect(Stream.take(changes, 2)))
        yield* Effect.yieldNow
        yield* StoreEvents.use((events) => events.bump)
        return yield* Fiber.join(fiber)
      })
      const values = yield* program.pipe(Effect.provide(Layer.mergeAll(repo, StoreEvents.layer)))
      expect(values).toEqual([Option.none(), Option.some(1.25)])
    }),
  )
})
