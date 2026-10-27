import {
  ActivityExportRepo,
  SealedToken as DbSealedToken,
  type ExportRow,
  GarminImportRepo,
  IntegrationRepo,
} from "@tanren/db"
import {
  type ActivityExport,
  DEFAULT_EXPORTS_LIMIT,
  GarminTokenRejected,
  IdGenerator,
  IntegrationNotConnected,
  type IntegrationsStatus,
  NotFound,
  type Provider,
  type ProviderStatus,
  type UserId,
  Uuid,
} from "@tanren/shared"
import { Array as Arr, DateTime, Effect, Option, Predicate, Redacted } from "effect"
import { HttpEffect, HttpServerResponse } from "effect/http"
import { HttpApiBuilder, HttpApiError } from "effect/http-api"
import { makeLimiter } from "../auth/nativeAuthRoutes"
import { WorkerConfig } from "../Config"
import {
  CONNECT_COOKIE,
  CONNECT_COOKIE_MAX_AGE_SECONDS,
  newBinding,
  startConnect,
} from "../integrations/connect"
import { ExportQueue } from "../integrations/ExportQueue"
import { GarminApi } from "../integrations/GarminApi"
import { GarminPull, readCursor } from "../integrations/GarminPull"
import { isNativeReturnTo } from "../integrations/returnTo"
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
const AVAILABLE_PROVIDERS: ReadonlyArray<Provider> = ["strava", "garmin"]

/** The connect handler's inline pull (ADR-0018 §4); the cron picks up whatever it did not finish. */
export const GARMIN_CONNECT_PULL_TIMEOUT = "5 seconds"
/** The account name when Garmin's profile call fails or has no display name. */
const GARMIN_FALLBACK_NAME = "Garmin account"

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
    const garmin = yield* GarminApi
    const garminPull = yield* GarminPull
    const garminImports = yield* GarminImportRepo
    const ids = yield* IdGenerator

    /** Garmin only: live import counts plus the cursor's last pull and error. */
    const importsOf = (userId: UserId, provider: Provider, scope: Option.Option<string>) =>
      provider === "garmin"
        ? Effect.map(garminImports.counts(userId, provider), (counts) => {
            const cursor = Option.flatMap(scope, readCursor)
            return {
              imports: {
                lastPullAt: Option.flatMap(cursor, (c) => c.lastPullAt),
                lastError: Option.flatMap(cursor, (c) => c.lastError),
                activities: counts.activities,
                days: counts.days,
              },
            }
          })
        : Effect.succeed({})

    /** One `get` + one `counts` statement per provider (Garmin: one more for its imports). */
    const providerStatus = (userId: UserId, provider: Provider) =>
      Effect.gen(function* () {
        const row = yield* integrations.get(userId, provider)
        const counts = yield* exports.counts(userId, provider)
        const imports = yield* importsOf(
          userId,
          provider,
          Option.map(row, (r) => r.scope),
        )
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
          ...imports,
        }
        return status
      })

    /**
     * garmin.md §3 connect: validate the key with one exchange, seal key and JWT, upsert, pull
     * inline. Logs carry the user id and a reason literal only, never the key, the JWT or the body.
     */
    const connectGarmin = (token: string) =>
      Effect.gen(function* () {
        const userId = yield* currentUser
        yield* limit(`garmin-connect:${userId}`)
        if (config.garminMode === "provider" && config.garminBaseUrl.length === 0) {
          return yield* new GarminTokenRejected({ reason: "not-configured" })
        }
        const key = Redacted.make(token)
        const exchanged = yield* garmin.exchange(key).pipe(
          Effect.tapError((error) =>
            Effect.logWarning(`[garmin] connect refused userId=${userId} reason=${error.reason}`),
          ),
          Effect.mapError(
            (error) =>
              new GarminTokenRejected({
                reason:
                  error.reason === "token_rejected" || error.reason === "rejected"
                    ? "rejected"
                    : "unreachable",
              }),
          ),
        )
        const displayName = yield* garmin.profile(exchanged.jwt).pipe(
          Effect.map((profile) =>
            Option.getOrElse(profile.displayName, () => GARMIN_FALLBACK_NAME),
          ),
          Effect.catch(() => Effect.succeed(GARMIN_FALLBACK_NAME)),
        )
        // The 24 h JWT is the `access` slot, the personal key the `refresh` slot (garmin.md §3).
        const bound = { userId, provider: "garmin" } as const
        const access = yield* seal.seal(exchanged.jwt, { ...bound, slot: "access" })
        const refresh = yield* seal.seal(key, { ...bound, slot: "refresh" })
        const now = yield* DateTime.now
        // A re-connect keeps the row's id and createdAt (the upsert's conflict clause).
        yield* integrations.upsert({
          id: Uuid.make(yield* ids.next),
          userId,
          provider: "garmin",
          status: "active",
          externalId: "personal",
          displayName,
          // Same `v1.<iv>.<ct>` string under TokenSeal's brand and the db column's brand.
          accessToken: DbSealedToken.make(access),
          refreshToken: DbSealedToken.make(refresh),
          expiresAt: exchanged.expiresAt,
          scope: "",
          createdAt: now,
          updatedAt: now,
        })
        yield* garminPull
          .drainUser(userId)
          .pipe(Effect.timeout(GARMIN_CONNECT_PULL_TIMEOUT), Effect.ignore)
        return yield* providerStatus(userId, "garmin")
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
          // SEC-1 B1: the web flow binds the state to a cookie in this browser; native has no jar.
          const binding = isNativeReturnTo(payload.returnTo)
            ? Option.none<string>()
            : Option.some(yield* newBinding)
          const response = yield* startConnect(config, userId, payload.returnTo, binding)
          if (Option.isSome(binding)) {
            yield* HttpEffect.appendPreResponseHandler((_request, res) =>
              // Constant name, base64url value, fixed options: a `CookiesError` is a defect.
              HttpServerResponse.setCookie(CONNECT_COOKIE, binding.value, {
                path: "/",
                secure: true,
                httpOnly: true,
                sameSite: "lax",
                maxAge: `${CONNECT_COOKIE_MAX_AGE_SECONDS} seconds`,
              })(res).pipe(Effect.orDie),
            )
          }
          return response
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
            yield* seal
              .open(SealedToken.make(row.value.accessToken), {
                userId,
                provider: "strava",
                slot: "access",
              })
              .pipe(
                Effect.flatMap(strava.revoke),
                Effect.catch((error) =>
                  Effect.logWarning(`[strava] revoke failed userId=${userId} tag=${error._tag}`),
                ),
              )
            yield* integrations.remove(userId, "strava")
          }),
        ),
      garminConnect: ({ payload }) => internal(connectGarmin(payload.token)),
      // garmin.md §4: the sealed key goes with the row; imported rows are soft-deleted (ruling 4).
      garminDisconnect: () =>
        internal(
          Effect.gen(function* () {
            const userId = yield* currentUser
            const row = yield* integrations.get(userId, "garmin")
            if (Option.isNone(row)) {
              return yield* new IntegrationNotConnected({ provider: "garmin" })
            }
            const removed = yield* garminImports.softDeleteAll(userId, "garmin")
            yield* integrations.remove(userId, "garmin")
            yield* Effect.log(`[garmin] disconnected userId=${userId} imports=${removed}`)
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
