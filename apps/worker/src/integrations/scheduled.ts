import {
  ActivityExportRepo,
  D1Layer,
  ExerciseRepo,
  GarminImportRepo,
  IntegrationRepo,
  PlanRepo,
  ProfileRepo,
  SessionRepo,
  SyncStore,
} from "@tanren/db"
import { IdGenerator } from "@tanren/shared"
import { Effect, Layer, ManagedRuntime, Option } from "effect"
import { WorkerConfig } from "../Config"
import type { Env } from "../Env"
import { ExportQueue } from "./ExportQueue"
import { GarminApi } from "./GarminApi"
import { GARMIN_MAX_USERS_PER_RUN, GarminPull } from "./GarminPull"
import { StravaApi } from "./StravaApi"
import { TokenSeal } from "./TokenSeal"

/** Rows one cron run attempts (design §6); a backlog drains over the following runs. */
export const SCHEDULED_MAX = 10

/** What a cron run uses: the two drains, nothing else. */
export type ScheduledServices = ExportQueue | GarminPull

/**
 * The slim cron layer (GM-F2, Workers Free 10 ms CPU): only the ports the export drain and the
 * Garmin pull read, on one D1 client. No Better Auth, OAuth, MCP, HttpApi or router, and no repository
 * the drains never touch (tokens, OAuth codes, erasure, food). `TokenSeal` derives its key on first
 * use, so a run with nothing to do never runs HKDF.
 */
export const scheduledLayer = (env: Env) => {
  const repos = Layer.mergeAll(
    IntegrationRepo.layer,
    ActivityExportRepo.layer,
    SessionRepo.layer,
    ExerciseRepo.layer,
    ProfileRepo.layer,
    PlanRepo.layer,
    // Garmin imports write through the sync store (garmin.md §2).
    GarminImportRepo.layer.pipe(Layer.provide(SyncStore.layer)),
  ).pipe(Layer.provide(IdGenerator.layer), Layer.provide(D1Layer(env.DB)), Layer.orDie)
  const ports = Layer.mergeAll(
    repos,
    StravaApi.layer,
    GarminApi.layer,
    TokenSeal.layer,
    IdGenerator.layer,
  )
  return Layer.mergeAll(ExportQueue.layer, GarminPull.layer).pipe(
    Layer.provide(ports),
    Layer.provide(WorkerConfig.layerFromEnv(env)),
  )
}

export interface Scheduled {
  /** One cron run: drains due exports of every user, then pulls Garmin. Never rejects. */
  readonly run: () => Promise<void>
  readonly dispose: () => Promise<void>
}

const exportDrain = Effect.gen(function* () {
  const drained = yield* (yield* ExportQueue).drain({ userId: Option.none(), max: SCHEDULED_MAX })
  yield* Effect.log(`[scheduled] export drain attempted=${drained}`)
}).pipe(Effect.catchCause((cause) => Effect.logError("[scheduled] export drain failed", cause)))

const garminDrain = Effect.gen(function* () {
  const pulled = yield* (yield* GarminPull).drain({ max: GARMIN_MAX_USERS_PER_RUN })
  yield* Effect.log(`[scheduled] garmin drain users=${pulled}`)
}).pipe(Effect.catchCause((cause) => Effect.logError("[scheduled] garmin drain failed", cause)))

/**
 * The cron safety net (`triggers.crons` in wrangler.jsonc). The layer is built on the first run and
 * reused by every later run of the isolate (`ManagedRuntime` builds lazily and caches the context),
 * so a warm tick pays for the two drains only. Each drain has its own `catchCause`, so a Garmin
 * failure never blocks the Strava exports or the reverse; a failed build (`ConfigError` from the
 * vars, a defect) is logged, never rejected.
 */
export const makeScheduled = <E>(layer: Layer.Layer<ScheduledServices, E>): Scheduled => {
  const runtime = ManagedRuntime.make(layer)
  const program = Effect.gen(function* () {
    const context = yield* runtime.contextEffect
    yield* Effect.andThen(exportDrain, garminDrain).pipe(Effect.provide(context))
  }).pipe(Effect.catchCause((cause) => Effect.logError("[scheduled] layer build failed", cause)))
  return { run: () => Effect.runPromise(program), dispose: () => runtime.dispose() }
}
