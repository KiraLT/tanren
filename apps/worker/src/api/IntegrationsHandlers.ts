import { ActivityExportRepo, type ExportRow, IntegrationRepo } from "@tanren/db"
import {
  type ActivityExport,
  DEFAULT_EXPORTS_LIMIT,
  IntegrationNotConnected,
  type IntegrationsStatus,
  NotFound,
  type Provider,
  type ProviderStatus,
  type UserId,
} from "@tanren/shared"
import { Array as Arr, DateTime, Effect, Option, Predicate } from "effect"
import { HttpApiBuilder, HttpApiError } from "effect/http-api"
import { makeLimiter } from "../auth/nativeAuthRoutes"
import { WorkerConfig } from "../Config"
import { startConnect } from "../integrations/connect"
import { ExportQueue } from "../integrations/ExportQueue"
import { StravaApi } from "../integrations/StravaApi"
import { SealedToken, TokenSeal } from "../integrations/TokenSeal"
import type { PersistenceError } from "../repos"
import { Api } from "./Api"
import { CurrentUser } from "./Authentication"

/** `PersistenceError` is internal: log it and answer 500 without details. */
const isOtherError = <E>(error: E): error is Exclude<E, PersistenceError> =>
  !Predicate.isTagged(error, "PersistenceError")

const internal = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, Exclude<E, PersistenceError> | HttpApiError.InternalServerError, R> =>
  Effect.catch(
    effect,
    (
      error,
    ): Effect.Effect<never, Exclude<E, PersistenceError> | HttpApiError.InternalServerError> =>
      isOtherError(error)
        ? Effect.fail(error)
        : Effect.logError("persistence failure", error).pipe(
            Effect.andThen(Effect.fail(new HttpApiError.InternalServerError())),
          ),
  )

/** Providers with a card in the app; `Provider.literals` also holds ones still being built. */
// garmin joins when GM-4 lands its connect endpoint
const AVAILABLE_PROVIDERS: ReadonlyArray<Provider> = ["strava"]

const currentUser = CurrentUser.use((user) => Effect.succeed(user.userId))

/** The db row as the wire shape: no `userId`, no `nextAttemptAt`. */
export const toActivityExport = (row: ExportRow): ActivityExport => ({
  id: row.id,
  provider: row.provider,
  sessionId: row.sessionId,
  status: row.status,
  attempts: row.attempts,
  externalActivityId: row.externalActivityId,
  lastError: row.lastError,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

export const IntegrationsLive = HttpApiBuilder.group(
  Api,
  "integrations",
  Effect.fn(function* (handlers) {
    const config = yield* WorkerConfig
    const integrations = yield* IntegrationRepo
    const exports = yield* ActivityExportRepo
    const strava = yield* StravaApi
    const seal = yield* TokenSeal
    const queue = yield* ExportQueue
    const limit = yield* makeLimiter

    /** One `get` + one `counts` statement per provider. */
    const providerStatus = (userId: UserId, provider: Provider) =>
      Effect.gen(function* () {
        const row = yield* integrations.get(userId, provider)
        const counts = yield* exports.counts(userId, provider)
        const status: ProviderStatus = {
          provider,
          state: Option.match(row, {
            onNone: () => "disconnected" as const,
            onSome: (r) => (r.status === "revoked" ? ("revoked" as const) : ("connected" as const)),
          }),
          account: Option.map(row, (r) => ({ displayName: r.displayName })),
          connectedAt: Option.map(row, (r) => r.createdAt),
          lastExportAt: counts.lastSentAt,
          pendingExports: counts.pending,
          failedExports: counts.failed,
          blockedExports: counts.blocked,
        }
        return status
      })

    return handlers.handleAll({
      status: () =>
        internal(
          Effect.gen(function* () {
            const userId = yield* currentUser
            const providers = yield* Effect.forEach(AVAILABLE_PROVIDERS, (provider) =>
              providerStatus(userId, provider),
            )
            const result: IntegrationsStatus = { providers }
            return result
          }),
        ),
      // Keyed by user: the route is authenticated, so the caller is known (design §4 rate limiting).
      connect: ({ payload }) =>
        Effect.gen(function* () {
          const userId = yield* currentUser
          yield* limit(`strava-connect:${userId}`)
          return yield* startConnect(config, userId, payload.returnTo)
        }),
      disconnect: () =>
        internal(
          Effect.gen(function* () {
            const userId = yield* currentUser
            const row = yield* integrations.get(userId, "strava")
            if (Option.isNone(row)) {
              return yield* new IntegrationNotConnected({ provider: "strava" })
            }
            // Best effort: a dead token or a Strava outage must not keep the row (design §5).
            // Same `v1.<iv>.<ct>` string under the db column's brand and TokenSeal's brand.
            yield* seal.open(SealedToken.make(row.value.accessToken)).pipe(
              Effect.flatMap(strava.revoke),
              Effect.catch((error) =>
                Effect.logWarning(`[strava] revoke failed userId=${userId} tag=${error._tag}`),
              ),
            )
            yield* integrations.remove(userId, "strava")
          }),
        ),
      exports: ({ query }) =>
        internal(
          Effect.gen(function* () {
            const userId = yield* currentUser
            const rows = yield* exports.list(userId, "strava", query.limit ?? DEFAULT_EXPORTS_LIMIT)
            return Arr.map(rows, toActivityExport)
          }),
        ),
      retry: ({ payload }) =>
        internal(
          Effect.gen(function* () {
            const userId = yield* currentUser
            const row = yield* integrations.get(userId, "strava")
            if (Option.isNone(row) || row.value.status !== "active") {
              return yield* new IntegrationNotConnected({ provider: "strava" })
            }
            const now = yield* DateTime.now
            const reset = yield* exports.resetToPending(userId, payload.id, now)
            if (!reset) {
              return yield* new NotFound({ entity: "activityExport", id: payload.id })
            }
            yield* queue.drain({ userId: Option.some(userId), max: 1 })
            const rows = yield* exports.list(userId, "strava", 500)
            return yield* Option.match(
              Arr.findFirst(rows, (r) => r.id === payload.id),
              {
                onNone: () =>
                  Effect.fail(new NotFound({ entity: "activityExport", id: payload.id })),
                onSome: (r) => Effect.succeed(toActivityExport(r)),
              },
            )
          }),
        ),
    })
  }),
)
