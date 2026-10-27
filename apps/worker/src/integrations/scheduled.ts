import { Effect, Layer, Option } from "effect"
import { d1Persistence } from "../app"
import { WorkerConfig } from "../Config"
import type { Env } from "../Env"
import { ExportQueue } from "./ExportQueue"
import { GarminApi } from "./GarminApi"
import { GARMIN_MAX_USERS_PER_RUN, GarminPull } from "./GarminPull"
import { TokenSeal } from "./TokenSeal"

/** Rows one cron run attempts (design §6); a backlog drains over the following runs. */
export const SCHEDULED_MAX = 10

/** `GarminPull` on the D1 binding with the configured `GarminApi` (`GARMIN_MODE`). Needs `WorkerConfig`. */
const garminPullD1 = (db: D1Database) =>
  GarminPull.layer.pipe(
    Layer.provide(Layer.mergeAll(d1Persistence(db), GarminApi.layer, TokenSeal.layer)),
  )

/**
 * The cron safety net (`triggers.crons` in wrangler.jsonc): drains due exports of every user, then
 * pulls Garmin (garmin.md §3). Built per invocation (a cron run is rare); never rejects: each drain
 * has its own `catchCause`, so a Garmin failure never blocks the Strava exports or the reverse.
 */
export const runScheduled = (env: Env): Promise<void> => {
  const config = WorkerConfig.layerFromEnv(env)
  const exportDrain = Effect.gen(function* () {
    const drained = yield* (yield* ExportQueue).drain({
      userId: Option.none(),
      max: SCHEDULED_MAX,
    })
    yield* Effect.log(`[scheduled] export drain attempted=${drained}`)
  }).pipe(
    Effect.provide(ExportQueue.layerD1(env.DB).pipe(Layer.provide(config))),
    Effect.catchCause((cause) => Effect.logError("[scheduled] export drain failed", cause)),
  )
  const garminDrain = Effect.gen(function* () {
    const pulled = yield* (yield* GarminPull).drain({ max: GARMIN_MAX_USERS_PER_RUN })
    yield* Effect.log(`[scheduled] garmin drain users=${pulled}`)
  }).pipe(
    Effect.provide(garminPullD1(env.DB).pipe(Layer.provide(config))),
    Effect.catchCause((cause) => Effect.logError("[scheduled] garmin drain failed", cause)),
  )
  return Effect.runPromise(Effect.andThen(exportDrain, garminDrain))
}
