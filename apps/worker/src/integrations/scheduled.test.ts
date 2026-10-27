import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Ref } from "effect"
import { ExportQueue } from "./ExportQueue"
import { GarminPull } from "./GarminPull"
import { makeScheduled, type ScheduledServices } from "./scheduled"

interface Counters {
  readonly builds: Ref.Ref<number>
  readonly exportDrains: Ref.Ref<number>
  readonly garminDrains: Ref.Ref<number>
}

/** Both drains as counters, plus a counter of how often the layer itself is built. */
const countingLayer = (counters: Counters): Layer.Layer<ScheduledServices> =>
  Layer.mergeAll(
    Layer.succeed(
      ExportQueue,
      ExportQueue.of({
        enqueueCompleted: () => Effect.void,
        drain: () => Ref.updateAndGet(counters.exportDrains, (n) => n + 1),
      }),
    ),
    Layer.succeed(
      GarminPull,
      GarminPull.of({
        drain: () => Ref.updateAndGet(counters.garminDrains, (n) => n + 1),
        drainUser: () => Effect.void,
      }),
    ),
    Layer.effectDiscard(Ref.update(counters.builds, (n) => n + 1)),
  )

const makeCounters = Effect.all({
  builds: Ref.make(0),
  exportDrains: Ref.make(0),
  garminDrains: Ref.make(0),
})

describe("makeScheduled (GM-F2: one runtime per isolate)", () => {
  it.effect("builds the layer once across two cron runs", () =>
    Effect.gen(function* () {
      const counters = yield* makeCounters
      const scheduled = makeScheduled(countingLayer(counters))
      yield* Effect.promise(() => scheduled.run())
      yield* Effect.promise(() => scheduled.run())
      yield* Effect.promise(() => scheduled.dispose())
      expect(yield* Ref.get(counters.builds)).toBe(1)
    }),
  )

  it.effect("runs both drains on every run", () =>
    Effect.gen(function* () {
      const counters = yield* makeCounters
      const scheduled = makeScheduled(countingLayer(counters))
      yield* Effect.promise(() => scheduled.run())
      yield* Effect.promise(() => scheduled.run())
      yield* Effect.promise(() => scheduled.dispose())
      expect([
        yield* Ref.get(counters.exportDrains),
        yield* Ref.get(counters.garminDrains),
      ]).toEqual([2, 2])
    }),
  )

  it.effect("still pulls Garmin when the export drain dies", () =>
    Effect.gen(function* () {
      const counters = yield* makeCounters
      const dying = Layer.mergeAll(
        Layer.succeed(
          ExportQueue,
          ExportQueue.of({ enqueueCompleted: () => Effect.void, drain: () => Effect.die("boom") }),
        ),
        Layer.succeed(
          GarminPull,
          GarminPull.of({
            drain: () => Ref.updateAndGet(counters.garminDrains, (n) => n + 1),
            drainUser: () => Effect.void,
          }),
        ),
      )
      const scheduled = makeScheduled(dying)
      yield* Effect.promise(() => scheduled.run())
      yield* Effect.promise(() => scheduled.dispose())
      expect(yield* Ref.get(counters.garminDrains)).toBe(1)
    }),
  )

  it.effect("resolves (never rejects) when the layer fails to build", () =>
    Effect.gen(function* () {
      const broken: Layer.Layer<ScheduledServices> = Layer.effectDiscard(Effect.die("no D1")).pipe(
        Layer.provideMerge(Layer.mergeAll(ExportQueue.layerDisabled, GarminPull.layerDisabled)),
      )
      const scheduled = makeScheduled(broken)
      const settled = yield* Effect.promise(() =>
        scheduled.run().then(
          () => "resolved",
          () => "rejected",
        ),
      )
      yield* Effect.promise(() => scheduled.dispose())
      expect(settled).toBe("resolved")
    }),
  )
})
