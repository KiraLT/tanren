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
import { WorkerConfig } from "./Config"
import type { EnvVars } from "./Env"
import {
  D1Layer,
  type ExerciseRepo,
  MemoryStore,
  type PlanRepo,
  type ProfileRepo,
  Repositories,
  type SessionRepo,
} from "./repos"
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

export type Persistence = ProfileRepo | ExerciseRepo | PlanRepo | SessionRepo | SyncStore

export interface AppServices {
  readonly auth: AuthMode
  /** Repositories and sync store. Default: `memoryPersistence(MemoryStore.layer)`. */
  readonly persistence?: Layer.Layer<Persistence>
}

/** The memory repositories and sync store on one store, so REST writes show up in pull. */
export const memoryPersistence = (store: Layer.Layer<MemoryStore>): Layer.Layer<Persistence> =>
  Layer.mergeAll(Repositories.layerMemoryNoDeps, SyncStoreMemory).pipe(Layer.provide(store))

/**
 * The `@tanren/db` repositories and sync store on the D1 binding (the Worker). `D1Client.layer`
 * declares `ConfigError` for `Config`-sourced settings; ours are plain values, so it is a defect.
 */
export const d1Persistence = (db: D1Database): Layer.Layer<Persistence> =>
  Layer.mergeAll(Repositories.layer, SyncStore.layer).pipe(Layer.provide(D1Layer(db)), Layer.orDie)

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
}

const authLayers = (mode: AuthMode): AuthLayers =>
  Match.value(mode).pipe(
    Match.tagsExhaustive({
      Fixed: ({ sessions }): AuthLayers => ({ sessions, routes: Layer.empty }),
      BetterAuth: ({ betterAuth }): AuthLayers => ({
        sessions: SessionsLive.pipe(Layer.provide(betterAuth)),
        routes: betterAuthRoutes(betterAuth),
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
  const api = HttpApiBuilder.layer(Api).pipe(
    Layer.provide(HandlersLive),
    Layer.provide(Authentication.layer),
    Layer.provide(Sync.layer),
    Layer.provide(Layer.mergeAll(persistence, IdGenerator.layer, auth.sessions)),
  )
  const app = Layer.mergeAll(api, auth.routes).pipe(
    Layer.provide(corsLayer),
    Layer.provide(WorkerConfig.layerFromEnv(env)),
    Layer.provide(HttpServer.layerServices),
  )
  const web = HttpRouter.toWebHandler(app)
  return { handler: (request) => web.handler(request), dispose: web.dispose }
}
