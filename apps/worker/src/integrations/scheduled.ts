import { Effect, Layer, Option } from "effect"
import { WorkerConfig } from "../Config"
import type { Env } from "../Env"
import { ExportQueue } from "./ExportQueue"

/** Rows one cron run attempts (design §6); a backlog drains over the following runs. */
export const SCHEDULED_MAX = 10

/**
 * The cron safety net (`triggers.crons` in wrangler.jsonc): drains due exports of every user. Built
 * per invocation (a cron run is rare); never rejects: a config or drain failure is logged.
 */
export const runScheduled = (env: Env): Promise<void> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const drained = yield* (yield* ExportQueue).drain({
        userId: Option.none(),
        max: SCHEDULED_MAX,
      })
      yield* Effect.log(`[scheduled] export drain attempted=${drained}`)
    }).pipe(
      Effect.provide(
        ExportQueue.layerD1(env.DB).pipe(Layer.provide(WorkerConfig.layerFromEnv(env))),
      ),
      Effect.catchCause((cause) => Effect.logError("[scheduled] export drain failed", cause)),
    ),
  )
