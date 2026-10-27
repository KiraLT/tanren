import {
  SealedToken as DbSealedToken,
  GarminImportRepo,
  IntegrationRepo,
  type IntegrationRow,
  type PersistenceError,
  ProfileRepo,
} from "@tanren/db"
import {
  type DailyHealthInsert,
  type ExportFailureReason,
  type GarminCursor,
  GarminCursorJson,
  type ImportedActivityInsert,
  LocalDate,
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
  Predicate,
  type Redacted,
  Ref,
  Schema,
} from "effect"
import { addDays, localDayOf } from "../time/localDate"
import { REFRESH_MARGIN } from "./ExportQueue"
import {
  GARMIN_PAGE_SIZE,
  type GarminActivityWindow,
  GarminApi,
  type GarminApiError,
} from "./GarminApi"
import { TokenSeal, type TokenSealError } from "./TokenSeal"

/**
 * Users one cron run pulls (garmin.md §3); the rest wait for the next `*\/5` run, oldest first.
 * One, so a run's CPU (≤ 2 pages of 50 + 7 dailies) stays inside the Workers Free 10 ms (GM-F1).
 */
export const GARMIN_MAX_USERS_PER_RUN = 1
/** Garmin calls one user may cost per run, re-exchanges included (Workers subrequest budget). */
export const GARMIN_CALL_BUDGET = 10
/**
 * Activity pages per run (2 × `GARMIN_PAGE_SIZE` = 100 activities). When the cap cuts a window,
 * `activitiesSince` is kept and the next run re-reads that window from offset 0 (no page offset is
 * stored), so a window must hold ≤ 100 activities: see `GARMIN_WINDOW_DAYS`.
 */
export const GARMIN_MAX_ACTIVITY_PAGES = 2
/**
 * Calendar days one run's activity query spans, from `activitiesSince`. A 30-day back-fill walks
 * forward one window per run (Garmin's list order is not documented, so the walk never relies on
 * it); a window stalls only above 100 activities in 10 days.
 */
export const GARMIN_WINDOW_DAYS = 10
/** Daily summaries per run. */
export const GARMIN_MAX_DAYS = 7
/** First pull (or an unreadable cursor): activities of the last 30 days. */
export const GARMIN_BACKFILL_DAYS = 30

/** Garmin refused the key (or it no longer opens): revoke exactly row version `seen`. */
class GarminRevoked extends Data.TaggedError("GarminRevoked")<{ readonly seen: Timestamp }> {}
/** `GARMIN_CALL_BUDGET` is spent: stop calling, keep what was read. */
class GarminOutOfBudget extends Data.TaggedError("GarminOutOfBudget") {}

export interface GarminPullShape {
  /** Pulls up to `max` active Garmin users, oldest `updatedAt` first; returns how many. Never fails. */
  readonly drain: (opts: { readonly max: number }) => Effect.Effect<number>
  /** Pulls one user now (the connect handler's inline pull). Never fails; a no-op when not active. */
  readonly drainUser: (userId: UserId) => Effect.Effect<void>
}

const UNIQUE_VIOLATION = "UNIQUE constraint failed"

/**
 * True when a cause chain (PersistenceError → SqlError → D1 error) carries SQLite's unique-index
 * message: two writers raced on an import natural key. Bounded depth; reads `message` and `cause` only.
 */
const hasUniqueViolation = (cause: unknown, depth: number): boolean =>
  depth > 0 &&
  Predicate.isObject(cause) &&
  ((Predicate.hasProperty(cause, "message") &&
    Predicate.isString(cause.message) &&
    cause.message.includes(UNIQUE_VIOLATION)) ||
    (Predicate.hasProperty(cause, "cause") && hasUniqueViolation(cause.cause, depth - 1)))

export const isUniqueRace = (error: PersistenceError): boolean => hasUniqueViolation(error.cause, 6)

const localDate = (dt: DateTime.Utc): Effect.Effect<LocalDate> =>
  // `formatIsoDateUtc` always yields a valid `YYYY-MM-DD`: a failure here is a defect.
  Schema.decodeUnknownEffect(LocalDate)(DateTime.formatIsoDateUtc(dt)).pipe(Effect.orDie)

/** Empty or undecodable `scope` = no cursor (Lead ruling 2). */
export const readCursor = (scope: string): Option.Option<GarminCursor> =>
  Schema.decodeUnknownOption(GarminCursorJson)(scope)

/**
 * The window a cursor-less user starts from: activities since today − 30 d (UTC), health after
 * the user's local `today` − 7 d.
 */
const freshCursor = (now: DateTime.Utc, today: LocalDate): Effect.Effect<GarminCursor> =>
  Effect.map(
    addDays(today, -GARMIN_MAX_DAYS),
    (healthThrough): GarminCursor => ({
      activitiesSince: DateTime.subtract(DateTime.startOf(now, "day"), {
        days: GARMIN_BACKFILL_DAYS,
      }),
      healthThrough,
      lastPullAt: Option.none(),
      lastError: Option.none(),
    }),
  )

/** The days after `healthThrough` up to today, oldest first, at most `GARMIN_MAX_DAYS`. */
const pendingDays = (
  healthThrough: LocalDate,
  today: LocalDate,
): Effect.Effect<ReadonlyArray<LocalDate>> =>
  Effect.map(
    Effect.forEach(Arr.range(1, GARMIN_MAX_DAYS), (offset) => addDays(healthThrough, offset)),
    Arr.filter((day) => day <= today),
  )

/** No profile (or a deleted one) means UTC: the nutrition tools' rule (`nutritionTools.ts`). */
const UTC = "UTC"

const make = Effect.gen(function* () {
  const integrations = yield* IntegrationRepo
  const imports = yield* GarminImportRepo
  const api = yield* GarminApi
  const seal = yield* TokenSeal
  const profiles = yield* ProfileRepo

  /** The user's live profile zone; no profile, or a deleted one, → UTC. */
  const timezoneOf = (userId: UserId): Effect.Effect<string, PersistenceError> =>
    Effect.map(profiles.get(userId), (stored) =>
      Option.match(
        Option.filter(stored, (profile) => Option.isNone(profile.deletedAt)),
        { onNone: () => UTC, onSome: (profile) => profile.timezone },
      ),
    )

  const writeCursor = (row: IntegrationRow, cursor: GarminCursor) =>
    Schema.encodeEffect(GarminCursorJson)(cursor).pipe(
      // A cursor built from decoded values always encodes.
      Effect.orDie,
      Effect.flatMap((json) => integrations.setCursor(row.id, json)),
    )

  /** One user's pull (garmin.md §3). Fails only with `PersistenceError` or a defect. */
  const pullRow = Effect.fn("GarminPull.pullRow")(function* (
    row: IntegrationRow,
    timezone: string,
  ) {
    const now = yield* DateTime.now
    // The user's local day, not the UTC one (G-F1): Garmin's `calendarDate` is a local date.
    const today = yield* localDayOf(now, timezone)
    const stored = readCursor(row.scope)
    const cursor = Option.isSome(stored) ? stored.value : yield* freshCursor(now, today)
    const budget = yield* Ref.make(GARMIN_CALL_BUDGET)
    const spend = Ref.modify(budget, (left): readonly [boolean, number] => [
      left > 0,
      left - 1,
    ]).pipe(Effect.flatMap((ok) => (ok ? Effect.void : Effect.fail(new GarminOutOfBudget()))))

    const revokedVersion = (seen: Timestamp) => (_: TokenSealError) => new GarminRevoked({ seen })
    // The personal key is the `refresh` slot, the 24 h JWT the `access` slot (garmin.md §3).
    const bound = { userId: row.userId, provider: row.provider } as const
    const key = yield* seal
      .open(row.refreshToken, { ...bound, slot: "refresh" })
      .pipe(Effect.mapError(revokedVersion(row.updatedAt)))
    const storedJwt = yield* seal
      .open(row.accessToken, { ...bound, slot: "access" })
      .pipe(Effect.mapError(revokedVersion(row.updatedAt)))
    const auth = yield* Ref.make({ jwt: storedJwt, version: row.updatedAt, exchanged: false })

    /** Key → new JWT, stored sealed in ONE update; a refused key revokes the version in use. */
    const exchange = Effect.gen(function* () {
      const current = yield* Ref.get(auth)
      yield* spend
      const fresh = yield* api.exchange(key).pipe(
        Effect.catchIf(
          (error) => error.reason === "token_rejected",
          () => Effect.fail(new GarminRevoked({ seen: current.version })),
        ),
      )
      const access = yield* seal.seal(fresh.jwt, { ...bound, slot: "access" })
      yield* integrations.setTokens(row.id, {
        // Same `v1.<iv>.<ct>` string: TokenSeal's brand and the db column's brand name one value.
        access: DbSealedToken.make(access),
        refresh: row.refreshToken,
        expiresAt: fresh.expiresAt,
        updatedAt: now,
      })
      yield* Ref.set(auth, { jwt: fresh.jwt, version: now, exchanged: true })
      return fresh.jwt
    })

    /** A data call with the current JWT; a 401 re-exchanges once per run, a second one revokes. */
    const authed = <A>(
      call: (jwt: Redacted.Redacted<string>) => Effect.Effect<A, GarminApiError>,
    ) =>
      Effect.gen(function* () {
        const current = yield* Ref.get(auth)
        yield* spend
        return yield* call(current.jwt).pipe(
          Effect.catchIf(
            (error) => error.reason === "token_rejected",
            () =>
              current.exchanged
                ? Effect.fail(new GarminRevoked({ seen: current.version }))
                : exchange.pipe(
                    Effect.flatMap((jwt) =>
                      Effect.andThen(
                        spend,
                        call(jwt).pipe(
                          Effect.catchIf(
                            (error) => error.reason === "token_rejected",
                            () => Effect.fail(new GarminRevoked({ seen: now })),
                          ),
                        ),
                      ),
                    ),
                  ),
          ),
        )
      })

    if (DateTime.isLessThan(row.expiresAt, DateTime.add(now, REFRESH_MARGIN))) {
      yield* exchange
    }

    const windowEnd = DateTime.add(DateTime.startOf(cursor.activitiesSince, "day"), {
      days: GARMIN_WINDOW_DAYS - 1,
    })
    const windowEndDate = yield* localDate(windowEnd)
    const window: GarminActivityWindow = {
      startDate: yield* localDate(cursor.activitiesSince),
      endDate: windowEndDate < today ? windowEndDate : today,
    }
    /** Pages while `more`, at most `GARMIN_MAX_ACTIVITY_PAGES`; `complete` = the window was read. */
    const pages = (
      page: number,
      found: ReadonlyArray<ImportedActivityInsert>,
    ): Effect.Effect<
      { readonly items: ReadonlyArray<ImportedActivityInsert>; readonly complete: boolean },
      GarminApiError | GarminRevoked | PersistenceError
    > =>
      page >= GARMIN_MAX_ACTIVITY_PAGES
        ? Effect.succeed({ items: found, complete: false })
        : authed((jwt) => api.activities(jwt, window, page * GARMIN_PAGE_SIZE)).pipe(
            Effect.flatMap((result) =>
              result.more
                ? pages(page + 1, Arr.appendAll(found, result.items))
                : Effect.succeed({ items: Arr.appendAll(found, result.items), complete: true }),
            ),
            Effect.catchTag("GarminOutOfBudget", () =>
              Effect.succeed({ items: found, complete: false }),
            ),
          )
    const activities = yield* pages(0, [])
    yield* imports.upsertActivities(row.userId, activities.items)

    const days = yield* pendingDays(cursor.healthThrough, today)
    const read = yield* Effect.forEach(days, (day) =>
      authed((jwt) => api.daily(jwt, day)).pipe(
        Effect.map((summary) => Option.some({ day, summary })),
        Effect.catchTag("GarminOutOfBudget", () =>
          Effect.succeed(
            Option.none<{ day: LocalDate; summary: Option.Option<DailyHealthInsert> }>(),
          ),
        ),
      ),
    )
    const fetched = Arr.getSomes(Arr.takeWhile(read, Option.isSome))
    yield* imports.upsertDays(row.userId, Arr.getSomes(Arr.map(fetched, (f) => f.summary)))

    const yesterday = DateTime.subtract(DateTime.startOf(now, "day"), { days: 1 })
    const lastFinal = yield* addDays(today, -2)
    // Yesterday and today (local) are re-read every run, so the evening's final numbers for
    // yesterday land after local midnight: `healthThrough` never passes the day before yesterday.
    const healthThrough = Option.match(Arr.last(fetched), {
      onNone: () => cursor.healthThrough,
      onSome: ({ day }) => (day < lastFinal ? day : lastFinal),
    })
    // A read window moves on to the day after it, never past yesterday (late uploads are re-read).
    const afterWindow = DateTime.add(windowEnd, { days: 1 })
    const nextSince = DateTime.isLessThan(afterWindow, yesterday) ? afterWindow : yesterday
    yield* writeCursor(row, {
      activitiesSince: activities.complete ? nextSince : cursor.activitiesSince,
      healthThrough: healthThrough > cursor.healthThrough ? healthThrough : cursor.healthThrough,
      lastPullAt: Option.some(now),
      lastError: Option.none(),
      lastAttemptAt: now,
    })
    yield* Effect.log(
      `[garmin] pull userId=${row.userId} activities=${activities.items.length} days=${fetched.length}`,
    )
  })

  /** `pullRow` with its stop reasons settled: revoke, or keep the cursor and record `lastError`. */
  const pullUser = (
    row: IntegrationRow,
    timezone: string,
  ): Effect.Effect<void, PersistenceError> => {
    /**
     * A failed or skipped attempt stamps `lastAttemptAt` (so `listActive` rotates the cron's users)
     * and leaves `lastPullAt` (last success, shown as "Last import") and the data window as stored;
     * `lastError` is derived from the prior value.
     */
    const attempted = (
      lastError: (prior: Option.Option<ExportFailureReason>) => Option.Option<ExportFailureReason>,
    ) => {
      const cursor = readCursor(row.scope)
      return Effect.gen(function* () {
        const now = yield* DateTime.now
        const base = Option.isSome(cursor)
          ? cursor.value
          : yield* freshCursor(now, yield* localDayOf(now, timezone))
        yield* writeCursor(row, {
          ...base,
          lastError: lastError(base.lastError),
          lastAttemptAt: now,
        })
      })
    }
    const stopped = (reason: ExportFailureReason) => attempted(() => Option.some(reason))
    return pullRow(row, timezone).pipe(
      Effect.catchTags({
        GarminRevoked: ({ seen }) =>
          Effect.gen(function* () {
            yield* integrations.markRevoked(row.id, seen, yield* DateTime.now)
            yield* stopped("token_rejected")
            yield* Effect.logWarning(`[garmin] revoked userId=${row.userId}`)
          }),
        GarminApiError: ({ reason }) =>
          stopped(reason).pipe(
            Effect.andThen(
              Effect.logWarning(`[garmin] pull stopped userId=${row.userId} reason=${reason}`),
            ),
          ),
        GarminOutOfBudget: () => Effect.void,
        PersistenceError: (error) =>
          isUniqueRace(error)
            ? // A connect-time pull and the cron minted ids for the same natural key: the other
              // writer won. Not a user-facing error; the next run re-reads the same window.
              attempted((prior) => prior).pipe(
                Effect.andThen(
                  Effect.log(`[garmin] pull skipped userId=${row.userId} reason=race`),
                ),
              )
            : attempted((prior) => prior).pipe(Effect.ignore, Effect.andThen(Effect.fail(error))),
      }),
    )
  }

  /** A failed user is logged and skipped: one user never blocks the others. */
  const pullLogged = (row: IntegrationRow) =>
    timezoneOf(row.userId).pipe(
      Effect.flatMap((timezone) => pullUser(row, timezone)),
      Effect.catchCause((cause) =>
        Effect.logWarning(`[garmin] pull failed userId=${row.userId}`, cause),
      ),
    )

  const drain = (opts: { readonly max: number }): Effect.Effect<number> =>
    integrations.listActive("garmin").pipe(
      Effect.map(Arr.take(opts.max)),
      Effect.tap((rows) => Effect.forEach(rows, pullLogged, { discard: true })),
      Effect.map((rows) => rows.length),
      Effect.catchCause((cause) =>
        Effect.logWarning("[garmin] drain failed", cause).pipe(Effect.as(0)),
      ),
    )

  const drainUser = (userId: UserId): Effect.Effect<void> =>
    integrations.get(userId, "garmin").pipe(
      Effect.flatMap((row) =>
        Option.isSome(row) && row.value.status === "active" ? pullLogged(row.value) : Effect.void,
      ),
      Effect.catchCause((cause) =>
        Effect.logWarning(`[garmin] pull failed userId=${userId}`, cause),
      ),
    )

  return { drain, drainUser } satisfies GarminPullShape
})

export class GarminPull extends Context.Service<GarminPull, GarminPullShape>()(
  "@tanren/worker/GarminPull",
) {
  /** Needs `IntegrationRepo`, `GarminImportRepo`, `GarminApi` and `TokenSeal`. */
  static readonly layer = Layer.effect(this, make)
  /** Does nothing (tests that do not exercise Garmin). */
  static readonly layerDisabled = Layer.succeed(
    this,
    this.of({ drain: () => Effect.succeed(0), drainUser: () => Effect.void }),
  )
}
