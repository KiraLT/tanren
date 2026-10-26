import {
  ActivityExportRepo,
  SealedToken as DbSealedToken,
  type ExportOutcome,
  type ExportRow,
  IntegrationRepo,
  type IntegrationRow,
} from "@tanren/db"
import {
  ActivityExportId,
  type ExportFailureReason,
  IdGenerator,
  newId,
  type PushRequest,
  type PushResponse,
  type SessionId,
  type Timestamp,
  type UserId,
} from "@tanren/shared"
import {
  Array as Arr,
  Context,
  Data,
  DateTime,
  Effect,
  Layer,
  Option,
  pipe,
  type Redacted,
} from "effect"
import { D1Layer, ExerciseRepo, ProfileRepo, Repositories, SessionRepo } from "../repos"
import { activityFor } from "./activityText"
import { type NewActivity, type RefreshedTokens, StravaApi } from "./StravaApi"
import { TokenSeal, type TokenSealError } from "./TokenSeal"

/** An access token and the integration row version (`updated_at`) it belongs to. */
interface VersionedToken {
  readonly token: Redacted.Redacted<string>
  readonly version: Timestamp
}

/** Internal: Strava refused the tokens of row version `seen`; revoke that version only. */
class TokenRejected extends Data.TaggedError("TokenRejected")<{ readonly seen: Timestamp }> {}

// The export pipeline (design §6/§7): a finished session becomes a Strava activity. `Sync.push`
// enqueues and drains one row within the push; the cron `scheduled` handler drains the rest.

const PROVIDER = "strava" as const

/**
 * Wait after the n-th failed attempt of a retryable failure (index n − 1). The fifth failure is
 * `dead` (design §6), so the design's fifth step (+12 h) is never reached and is left out.
 */
const BACKOFF = [{ minutes: 1 }, { minutes: 5 }, { minutes: 30 }, { hours: 2 }] as const
/** The attempt whose retryable failure makes the row `dead`. */
export const MAX_ATTEMPTS = 5
/** An inactive Strava app: retried this much later, forever (never `dead`). */
export const BLOCKED_RETRY = { hours: 12 } as const
/** Refresh the access token when it expires within this window (design §7). */
export const REFRESH_MARGIN = { hours: 1 } as const

/** When to retry after `attemptsCompleted` failed attempts; `None` = give up (`dead`). */
export const nextAttempt = (attemptsCompleted: number, now: Timestamp): Option.Option<Timestamp> =>
  attemptsCompleted >= MAX_ATTEMPTS
    ? Option.none()
    : Option.map(Arr.get(BACKOFF, Math.max(0, attemptsCompleted - 1)), (wait) =>
        DateTime.add(now, wait),
      )

/** How one failed attempt settles (`unauthorized` also revokes the integration, see `attempt`). */
export const failureOutcome = (
  reason: ExportFailureReason,
  attemptsCompleted: number,
  now: Timestamp,
): ExportOutcome => {
  const retry = (): ExportOutcome =>
    Option.match(nextAttempt(attemptsCompleted, now), {
      onNone: () => ({ _tag: "Dead", reason, now }),
      onSome: (nextAttemptAt) => ({ _tag: "Pending", reason, nextAttemptAt, now }),
    })
  const policy: { readonly [R in ExportFailureReason]: () => ExportOutcome } = {
    transport: retry,
    provider_error: retry,
    rate_limited: retry,
    rejected: () => ({ _tag: "Failed", reason, now }),
    unauthorized: () => ({ _tag: "Failed", reason, now }),
    session_missing: () => ({ _tag: "Dead", reason, now }),
    app_inactive: () => ({
      _tag: "Blocked",
      reason,
      nextAttemptAt: DateTime.add(now, BLOCKED_RETRY),
      now,
    }),
  }
  return policy[reason]()
}

/** A session finished longer than this before it was completed (pushed) is not exported. */
export const EXPORT_BACKFILL_HOURS = 48

/**
 * Sessions this push completed: a `session` change with `finishedAt` Some and `deletedAt` None
 * whose id the store accepted (design §6, ADR-0018 §4), and whose `finishedAt` is at most
 * `EXPORT_BACKFILL_HOURS` before the accepted `updatedAt` (the moment it became completed): an
 * auto-finished or long-offline session is not backfilled to Strava (ADR-0018, REV-AF).
 */
export const completedSessionIds = (
  changes: PushRequest["changes"],
  accepted: PushResponse["accepted"],
): ReadonlyArray<SessionId> => {
  const acceptedSessions = Arr.filter(accepted, (change) => change.table === "session")
  const isRecent = (id: SessionId, finishedAt: DateTime.Utc) =>
    Arr.some(
      acceptedSessions,
      (change) =>
        change.id === id &&
        !DateTime.isLessThan(
          finishedAt,
          DateTime.subtract(change.updatedAt, { hours: EXPORT_BACKFILL_HOURS }),
        ),
    )
  return Arr.flatMap(changes, (change) =>
    change.table === "session" &&
    Option.isNone(change.row.deletedAt) &&
    Option.exists(change.row.finishedAt, (finishedAt) => isRecent(change.row.id, finishedAt))
      ? [change.row.id]
      : [],
  )
}

export interface ExportQueueShape {
  /** 0 statements when there is no active strava integration; never fails (logs). */
  readonly enqueueCompleted: (
    userId: UserId,
    changes: PushRequest["changes"],
    accepted: PushResponse["accepted"],
  ) => Effect.Effect<void>
  /** claimDue → attempt each → settle. Never fails (errors logged); returns the number of rows attempted. */
  readonly drain: (opts: {
    readonly userId: Option.Option<UserId>
    readonly max: number
  }) => Effect.Effect<number>
}

const isActive = (row: Option.Option<IntegrationRow>): row is Option.Some<IntegrationRow> =>
  Option.isSome(row) && row.value.status === "active"

const make = Effect.gen(function* () {
  const integrations = yield* IntegrationRepo
  const exportRows = yield* ActivityExportRepo
  const sessions = yield* SessionRepo
  const exercises = yield* ExerciseRepo
  const profiles = yield* ProfileRepo
  const strava = yield* StravaApi
  const seal = yield* TokenSeal
  const ids = yield* IdGenerator

  const enqueueCompleted = (
    userId: UserId,
    changes: PushRequest["changes"],
    accepted: PushResponse["accepted"],
  ): Effect.Effect<void> => {
    const sessionIds = completedSessionIds(changes, accepted)
    if (sessionIds.length === 0) {
      return Effect.void
    }
    return Effect.gen(function* () {
      if (!isActive(yield* integrations.get(userId, PROVIDER))) {
        return
      }
      const now = yield* DateTime.now
      const rows = yield* Effect.forEach(sessionIds, (sessionId) =>
        Effect.map(newId(ActivityExportId), (id) => ({
          id,
          userId,
          provider: PROVIDER,
          sessionId,
          nextAttemptAt: now,
          createdAt: now,
        })),
      )
      yield* exportRows.enqueue(rows)
    }).pipe(
      Effect.provideService(IdGenerator, ids),
      Effect.catchCause((cause) => Effect.logWarning("[export] enqueue failed", cause)),
    )
  }

  /**
   * The tokens of row version `version` (`updated_at`), or a newer version another drain stored
   * since `seen`; none → `TokenRejected { seen }` (revoke exactly that version).
   */
  /**
   * Opens one sealed token of row version `row.updatedAt`. Tokens that no longer open (rotated
   * key, tampering) reject exactly that version, so the guarded revoke hits the row it read.
   */
  const openOf = (row: IntegrationRow, sealed: IntegrationRow["accessToken"]) =>
    seal
      .open(sealed)
      .pipe(Effect.mapError((_: TokenSealError) => new TokenRejected({ seen: row.updatedAt })))

  const storedIfRotated = Effect.fn("ExportQueue.storedIfRotated")(function* (
    integration: IntegrationRow,
    seen: Timestamp,
  ) {
    const current = yield* integrations.get(integration.userId, integration.provider)
    if (isActive(current) && !DateTime.Equivalence(current.value.updatedAt, seen)) {
      const token = yield* openOf(current.value, current.value.accessToken)
      return { token, version: current.value.updatedAt } satisfies VersionedToken
    }
    return yield* new TokenRejected({ seen })
  })

  /**
   * Rotates both tokens and persists them sealed in ONE update (design §7). Strava refusing the
   * refresh (401, or 400 for a refresh token another drain already used) defers to that drain's
   * stored tokens when the row changed, else rejects this version.
   */
  const refreshTokens = Effect.fn("ExportQueue.refreshTokens")(function* (
    integration: IntegrationRow,
    now: Timestamp,
  ) {
    const refreshToken = yield* openOf(integration, integration.refreshToken)
    const rotated = yield* strava.refresh(refreshToken).pipe(
      Effect.map(Option.some),
      Effect.catchIf(
        (error) => error.reason === "unauthorized" || error.reason === "rejected",
        () => Effect.succeed(Option.none<RefreshedTokens>()),
      ),
    )
    if (Option.isNone(rotated)) {
      return yield* storedIfRotated(integration, integration.updatedAt)
    }
    const access = yield* seal.seal(rotated.value.accessToken)
    const refresh = yield* seal.seal(rotated.value.refreshToken)
    yield* integrations.setTokens(integration.id, {
      // Same `v1.<iv>.<ct>` string: TokenSeal's brand and the db column's brand name one value.
      access: DbSealedToken.make(access),
      refresh: DbSealedToken.make(refresh),
      expiresAt: rotated.value.expiresAt,
      updatedAt: now,
    })
    return { token: rotated.value.accessToken, version: now } satisfies VersionedToken
  })

  /** The stored access token, or a rotated one when it expires within `REFRESH_MARGIN`. */
  const freshToken = (integration: IntegrationRow, now: Timestamp) =>
    DateTime.isLessThan(integration.expiresAt, DateTime.add(now, REFRESH_MARGIN))
      ? refreshTokens(integration, now)
      : Effect.map(
          openOf(integration, integration.accessToken),
          (token): VersionedToken => ({ token, version: integration.updatedAt }),
        )

  /**
   * `unauthorized` from Strava with the tokens of `used.version`: re-read the row; when another
   * drain rotated it since, use its token, otherwise rotate it here. Exactly one retry (design §7).
   */
  const retryUnauthorized = Effect.fn("ExportQueue.retryUnauthorized")(function* (
    integration: IntegrationRow,
    used: VersionedToken,
    activity: NewActivity,
    now: Timestamp,
  ) {
    const current = yield* integrations.get(integration.userId, integration.provider)
    if (!isActive(current)) {
      return yield* new TokenRejected({ seen: used.version })
    }
    const next: VersionedToken = DateTime.Equivalence(current.value.updatedAt, used.version)
      ? yield* refreshTokens(current.value, now)
      : {
          token: yield* openOf(current.value, current.value.accessToken),
          version: current.value.updatedAt,
        }
    return yield* strava.createActivity(next.token, activity).pipe(
      Effect.catchIf(
        (error) => error.reason === "unauthorized",
        () => Effect.fail(new TokenRejected({ seen: next.version })),
      ),
    )
  })

  const send = Effect.fn("ExportQueue.send")(function* (
    integration: IntegrationRow,
    activity: NewActivity,
    now: Timestamp,
  ) {
    const used = yield* freshToken(integration, now)
    return yield* strava.createActivity(used.token, activity).pipe(
      Effect.catchIf(
        (error) => error.reason === "unauthorized",
        () => retryUnauthorized(integration, used, activity, now),
      ),
    )
  })

  /** One claimed row (already `running`): load, send, settle. Statement budget ≤ 8 with the claim. */
  const attempt = Effect.fn("ExportQueue.attempt")(function* (row: ExportRow) {
    const now = yield* DateTime.now
    const settle = (outcome: ExportOutcome) => exportRows.settle(row.id, outcome)
    const integration = yield* integrations.get(row.userId, row.provider)
    if (!isActive(integration)) {
      return yield* settle({ _tag: "Failed", reason: "unauthorized", now })
    }
    const session = yield* sessions.getSession(row.userId, row.sessionId)
    const finishedAt = pipe(
      session,
      Option.filter((s) => Option.isNone(s.deletedAt)),
      Option.flatMap((s) => s.finishedAt),
    )
    if (Option.isNone(session) || Option.isNone(finishedAt)) {
      return yield* settle({ _tag: "Dead", reason: "session_missing", now })
    }
    const sets = yield* sessions.listSets(row.userId, row.sessionId)
    const known = yield* exercises.list(row.userId, { includeDeleted: true })
    const profile = yield* profiles.get(row.userId)
    const activity = activityFor({
      session: session.value,
      finishedAt: finishedAt.value,
      sets,
      exercises: known,
      timezone: Option.map(profile, (p) => p.timezone),
    })
    /** Revokes only the row version whose tokens were refused (a newer rotation is kept). */
    const revoke = (seen: Timestamp) =>
      integrations
        .markRevoked(integration.value.id, seen, now)
        .pipe(Effect.as<ExportOutcome>({ _tag: "Failed", reason: "unauthorized", now }))
    // `Blocked` resets `attempts` to 0 (ActivityExportRepo), so blocked rounds never count here.
    const attemptsCompleted = row.attempts + 1
    const outcome = yield* send(integration.value, activity, now).pipe(
      Effect.map(
        (created): ExportOutcome => ({ _tag: "Sent", externalActivityId: created.id, now }),
      ),
      Effect.catchTags({
        StravaRequestFailed: (error) =>
          error.reason === "unauthorized"
            ? revoke(integration.value.updatedAt)
            : Effect.succeed(failureOutcome(error.reason, attemptsCompleted, now)),
        // Also tokens that no longer open (`openOf`): the version they came from is revoked.
        TokenRejected: (error) => revoke(error.seen),
      }),
    )
    yield* settle(outcome)
  })

  const drain = (opts: {
    readonly userId: Option.Option<UserId>
    readonly max: number
  }): Effect.Effect<number> =>
    Effect.gen(function* () {
      const now = yield* DateTime.now
      const rows = yield* exportRows.claimDue(now, opts)
      yield* Effect.forEach(
        rows,
        (row) =>
          // Uninterruptible: a cut between `refresh` and `setTokens` loses the rotated pair, and
          // one between `createActivity` and `settle` posts the activity twice. Every Strava call
          // is bounded (`STRAVA_REQUEST_TIMEOUT`), so an attempt always ends.
          Effect.uninterruptible(attempt(row)).pipe(
            Effect.catchCause((cause) =>
              Effect.logWarning(`[export] attempt failed id=${row.id}`, cause),
            ),
          ),
        { discard: true },
      )
      return rows.length
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.logWarning("[export] drain failed", cause).pipe(Effect.as(0)),
      ),
    )

  return { enqueueCompleted, drain } satisfies ExportQueueShape
})

export class ExportQueue extends Context.Service<ExportQueue, ExportQueueShape>()(
  "@tanren/worker/ExportQueue",
) {
  /**
   * Needs `IntegrationRepo`, `ActivityExportRepo`, `SessionRepo`, `ExerciseRepo`, `ProfileRepo`,
   * `StravaApi`, `TokenSeal` and `IdGenerator`.
   */
  static readonly layer = Layer.effect(this, make)
  /** No integrations (the Node memory store has no integration tables): does nothing. */
  static readonly layerDisabled = Layer.succeed(
    this,
    this.of({ enqueueCompleted: () => Effect.void, drain: () => Effect.succeed(0) }),
  )
  /**
   * `layer` on the D1 binding with the configured `StravaApi` and `TokenSeal`. Needs `WorkerConfig`.
   * `D1Client.layer` declares `ConfigError` for `Config`-sourced settings; ours are plain values.
   */
  static readonly layerD1 = (db: D1Database) =>
    ExportQueue.layer.pipe(
      Layer.provide(
        Layer.mergeAll(
          Repositories.layer.pipe(Layer.provide(D1Layer(db)), Layer.orDie),
          StravaApi.layer,
          TokenSeal.layer,
          IdGenerator.layer,
        ),
      ),
    )
}
