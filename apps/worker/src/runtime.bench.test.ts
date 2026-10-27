import { describe, expect, it } from "@effect/vitest"
import { Array as Arr, Clock, Effect, Layer, ManagedRuntime, Option, Order } from "effect"
import { d1Persistence, makeApp } from "./app"
import { BetterAuth } from "./auth/BetterAuth"
import { EmailSender } from "./auth/EmailSender"
import { WorkerConfig } from "./Config"
import { ExportQueue } from "./integrations/ExportQueue"
import { GarminApi } from "./integrations/GarminApi"
import { GarminPull } from "./integrations/GarminPull"
import { scheduledLayer } from "./integrations/scheduled"
import { TokenSeal } from "./integrations/TokenSeal"
import { envVars } from "./testing/fixtures"

// GM-F2 relative proxy for the cold-isolate CPU of a cron tick (production `cpuTime` is the real
// metric; `docs/design/deploy.md` §Garmin CPU check). Builds never touch the binding, so a stub
// object stands in for D1: building a layer must do no I/O (rules/effect.md).
const stubDb = {} as unknown as D1Database // cast: layer construction never calls the binding

const ITERATIONS = 20

const median = (samples: ReadonlyArray<number>): number =>
  Option.getOrElse(
    Arr.get(Arr.sort(samples, Order.Number), Math.floor(samples.length / 2)),
    () => Number.NaN,
  )

const timeMs = (run: Effect.Effect<void>) =>
  Effect.gen(function* () {
    const start = yield* Clock.currentTimeNanos
    yield* run
    return Number((yield* Clock.currentTimeNanos) - start) / 1e6
  })

const buildOnce = <R, E>(layer: Layer.Layer<R, E>) =>
  Effect.promise(async () => {
    const runtime = ManagedRuntime.make(layer)
    await runtime.context().catch(() => undefined)
    await runtime.dispose()
  })

/** The pre-GM-F2 cron: two separate builds, every repository plus three `SyncStore`s. */
const previousScheduled = () => {
  const config = WorkerConfig.layerFromEnv(envVars)
  return Layer.mergeAll(
    ExportQueue.layerD1(stubDb),
    GarminPull.layer.pipe(
      Layer.provide(Layer.mergeAll(d1Persistence(stubDb), GarminApi.layer, TokenSeal.layer)),
    ),
  ).pipe(Layer.provide(config))
}

/** What a cold HTTP isolate builds (`index.ts` `makeApp`), up to its first answered request. */
const fullApp = Effect.promise(async () => {
  const app = makeApp(envVars, {
    auth: {
      _tag: "BetterAuth",
      betterAuth: BetterAuth.layer(stubDb).pipe(Layer.provide(EmailSender.layer)),
    },
    persistence: d1Persistence(stubDb),
    exports: ExportQueue.layerD1(stubDb),
  })
  await app.handler(new Request("http://localhost/no-such-route"))
  await app.dispose()
})

const sample = (run: Effect.Effect<void>) =>
  Effect.forEach(Arr.range(1, ITERATIONS), () => timeMs(run)).pipe(Effect.map(median))

describe("runtime build cost (GM-F2 proxy)", () => {
  it.live("the slim cron layer builds faster than the full app and the previous cron", () =>
    Effect.gen(function* () {
      const full = yield* sample(fullApp)
      const previous = yield* sample(buildOnce(previousScheduled()))
      const slim = yield* sample(buildOnce(scheduledLayer({ ...envVars, DB: stubDb })))
      yield* Effect.log(
        `[bench] median build ms over ${ITERATIONS}: full=${full.toFixed(2)} previous=${previous.toFixed(2)} slim=${slim.toFixed(2)}`,
      )
      expect(slim).toBeLessThan(full)
    }),
  )
})
