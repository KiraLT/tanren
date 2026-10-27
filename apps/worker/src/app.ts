import {
  type AccountErasure,
  type ActivityExportRepo,
  FoodEntryRepo,
  GarminImportRepo,
  type IntegrationRepo,
  type OAuthCodeUseRepo,
  UserProgramRepo,
  type UserTokens,
} from "@tanren/db"
import { IdGenerator } from "@tanren/shared"
import { Effect, Layer, Match } from "effect"
import { HttpRouter, HttpServer } from "effect/http"
import { HttpApiBuilder } from "effect/http-api"
import { Api } from "./api/Api"
import { Authentication } from "./api/Authentication"
import { HandlersLive } from "./api/Handlers"
import { authRoutes } from "./auth/authRoutes"
import type { BetterAuth } from "./auth/BetterAuth"
import type { Sessions } from "./auth/Sessions"
import { SessionsLive } from "./auth/SessionsLive"
import { Tokens } from "./auth/Tokens"
import { tokenRoutes } from "./auth/tokenRoutes"
import { WorkerConfig } from "./Config"
import type { EnvVars } from "./Env"
import { callbackRoutes } from "./integrations/callbackRoutes"
import { ExportQueue } from "./integrations/ExportQueue"
import { GarminApi } from "./integrations/GarminApi"
import { GarminPull } from "./integrations/GarminPull"
import { StravaApi } from "./integrations/StravaApi"
import { TokenSeal } from "./integrations/TokenSeal"
import {
  D1Layer,
  type ExerciseRepo,
  MemoryStore,
  type PlanRepo,
  type ProfileRepo,
  Repositories,
  type SessionRepo,
} from "./repos"
import { MemoryAccountErasure } from "./repos/MemoryAccountErasure"
import { MemoryGarminImport } from "./repos/MemoryGarminImport"
import { MemoryIntegrations } from "./repos/MemoryIntegrations"
import { MemoryTokens } from "./repos/MemoryTokens"
import { Sync } from "./sync/Sync"
import { SyncStore, SyncStoreMemory } from "./sync/SyncStore"

export interface App {
  readonly handler: (request: Request) => Promise<Response>
  readonly dispose: () => Promise<void>
}

/** Who is signed in: a fixed answer (tests, dev) or Better Auth (production). */
export type AuthMode =
  | { readonly _tag: "Fixed"; readonly sessions: Layer.Layer<Sessions> }
  | {
      readonly _tag: "BetterAuth"
      /** One instance: it serves `/api/auth/*` and backs `Sessions.layer`. */
      readonly betterAuth: Layer.Layer<BetterAuth, never, WorkerConfig>
    }

export type Persistence =
  | ProfileRepo
  | ExerciseRepo
  | PlanRepo
  | SessionRepo
  | SyncStore
  | IntegrationRepo
  | ActivityExportRepo
  | UserTokens
  | OAuthCodeUseRepo
  | AccountErasure
  | GarminImportRepo
  | FoodEntryRepo
  | UserProgramRepo

export interface AppServices {
  readonly auth: AuthMode
  /** Repositories and sync store. Default: `memoryPersistence(MemoryStore.layer)`. */
  readonly persistence?: Layer.Layer<Persistence>
  /** The Strava export queue `Sync.push` feeds. Default: `ExportQueue.layerDisabled` (memory store). */
  readonly exports?: Layer.Layer<ExportQueue, never, WorkerConfig>
  /** Strava for the connect callback and disconnect. Default: `StravaApi.layer` (`STRAVA_MODE`). */
  readonly strava?: Layer.Layer<StravaApi, never, WorkerConfig>
  /** Garmin for connect and the inline pull. Default: `GarminApi.layer` (`GARMIN_MODE`). */
  readonly garmin?: Layer.Layer<GarminApi, never, WorkerConfig>
}

/**
 * The memory repositories and sync store on one store, so REST writes show up in pull; the
 * integration repositories keep their own in-memory state (`MemoryIntegrations`).
 */
export const memoryPersistence = (store: Layer.Layer<MemoryStore>): Layer.Layer<Persistence> =>
  Layer.mergeAll(
    Repositories.layerMemoryNoDeps,
    SyncStoreMemory,
    MemoryTokens.layer,
    MemoryAccountErasure.layer,
    // The import fake gates on the same `IntegrationRepo` the handlers use (disconnect wins).
    MemoryGarminImport.layer.pipe(
      Layer.provide(IdGenerator.layer),
      Layer.provideMerge(MemoryIntegrations.layer),
    ),
  ).pipe(Layer.provide(store))

/**
 * The `@tanren/db` repositories and sync store on the D1 binding (the Worker). `D1Client.layer`
 * declares `ConfigError` for `Config`-sourced settings; ours are plain values, so it is a defect.
 */
export const d1Persistence = (db: D1Database): Layer.Layer<Persistence> =>
  Layer.mergeAll(
    Repositories.layer,
    SyncStore.layer,
    // Garmin imports write through the same SyncStore (garmin.md §2); one SyncStore per build.
    GarminImportRepo.layer.pipe(Layer.provide(Layer.merge(SyncStore.layer, IdGenerator.layer))),
    FoodEntryRepo.layer.pipe(Layer.provide(SyncStore.layer)),
    UserProgramRepo.layer.pipe(Layer.provide(SyncStore.layer)),
  ).pipe(Layer.provide(D1Layer(db)), Layer.orDie)

/** CORS for the allowed origins, with cookies (`HttpRouter.cors` also answers preflights). */
const corsLayer = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* WorkerConfig
    return HttpRouter.cors({
      allowedOrigins: config.allowedOrigins,
      credentials: true,
      allowedHeaders: ["content-type", "authorization"],
    })
  }),
)

const betterAuthRoutes = (betterAuth: Layer.Layer<BetterAuth, never, WorkerConfig>) =>
  authRoutes.pipe(Layer.provide(betterAuth))

interface AuthLayers {
  readonly sessions: Layer.Layer<Sessions, never, WorkerConfig>
  readonly routes: ReturnType<typeof betterAuthRoutes>
  /** Real sessions: writes need the `user` row (STLS-F3); a fixed test identity has none. */
  readonly authentication: typeof Authentication.layer | typeof Authentication.layerFixed
}

const authLayers = (mode: AuthMode): AuthLayers =>
  Match.value(mode).pipe(
    Match.tagsExhaustive({
      Fixed: ({ sessions }): AuthLayers => ({
        sessions,
        routes: Layer.empty,
        authentication: Authentication.layerFixed,
      }),
      BetterAuth: ({ betterAuth }): AuthLayers => ({
        // App JWT first (no D1), then the Better Auth cookie (auth-v2.md §4).
        sessions: SessionsLive.pipe(Layer.provide(betterAuth)),
        routes: betterAuthRoutes(betterAuth),
        authentication: Authentication.layer,
      }),
    }),
  )

/**
 * The Worker as a web handler, independent of `cloudflare:workers` so tests can call it. Build once
 * per isolate. `env` is only read for vars here; the D1 binding comes in via `services.persistence`.
 */
export const makeApp = (env: EnvVars, services: AppServices): App => {
  const auth = authLayers(services.auth)
  const persistence = services.persistence ?? memoryPersistence(MemoryStore.layer)
  // One reference, so the API and the Strava callback share one built instance (one memory store).
  const shared = Layer.mergeAll(
    persistence,
    IdGenerator.layer,
    services.strava ?? StravaApi.layer,
    services.garmin ?? GarminApi.layer,
    TokenSeal.layer,
  )
  const api = HttpApiBuilder.layer(Api).pipe(
    Layer.provide(HandlersLive),
    Layer.provide(auth.authentication),
    Layer.provide(Sync.layer),
    Layer.provide(GarminPull.layer),
    Layer.provide(
      Layer.mergeAll(
        shared,
        auth.sessions,
        Tokens.layer,
        services.exports ?? ExportQueue.layerDisabled,
      ),
    ),
  )
  // A plain route next to `auth.routes`: it answers 303 / HTML and reads no session (design §4).
  const callback = callbackRoutes.pipe(Layer.provide(shared))
  // Native session exchange (in `auth.routes`) and `/api/token/*` read the token generations from
  // persistence; `Tokens.layer` is one reference, so every user shares one instance.
  const routes = auth.routes.pipe(Layer.provide(shared))
  const token = tokenRoutes.pipe(Layer.provide(Layer.mergeAll(shared, auth.sessions, Tokens.layer)))
  const app = Layer.mergeAll(api, routes, token, callback).pipe(
    Layer.provide(corsLayer),
    Layer.provide(WorkerConfig.layerFromEnv(env)),
    Layer.provide(HttpServer.layerServices),
  )
  const web = HttpRouter.toWebHandler(app)
  return { handler: (request) => web.handler(request), dispose: web.dispose }
}
