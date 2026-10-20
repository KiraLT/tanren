import { IdGenerator, Uuid } from "@tanren/shared"
import {
  Cause,
  Data,
  DateTime,
  type Duration,
  Effect,
  Layer,
  ManagedRuntime,
  Option,
  Predicate,
  Schedule,
  type Scope,
} from "effect"
import { randomUUID } from "expo-crypto"
import { seedIfEmpty } from "../store/seed"
import { CurrentUser } from "./CurrentUser"
import { LocalStore } from "./LocalStore"
import { PlanWeekRepo } from "./PlanWeekRepo"
import { DATABASE_NAME, SqlDriver, StoreError } from "./SqlDriver"
import { StoreEvents } from "./StoreEvents"
import { SyncEngine } from "./SyncEngine"
import { SyncTransport } from "./SyncTransport"
import { TodayRepo } from "./TodayRepo"

/**
 * Device ids from expo-crypto: Hermes may lack `crypto.randomUUID`. A generated string is always
 * a valid UUID, so a failed check is a defect. Tests use `IdGenerator.layerTest` instead.
 */
const AppIdGenerator = Layer.succeed(
  IdGenerator,
  IdGenerator.of({
    next: Effect.sync(randomUUID).pipe(
      Effect.flatMap((raw) => Uuid.makeEffect(raw)),
      Effect.orDie,
    ),
  }),
)

/**
 * Internal: another live tab holds the database's Web Lock (web is single-tab in v1). It fails
 * the runtime build, which `ManagedRuntime` caches for the page's life, so recovery is a reload
 * once the other tab is closed (the `failureMessage` copy says so).
 */
export class DatabaseInUse extends Data.TaggedError("DatabaseInUse")<{
  readonly lockName: string
}> {}

/** The slice of `LockManager` this module uses: `navigator.locks` in the app, a fake in tests. */
export interface DatabaseLocks {
  readonly request: (
    name: string,
    options: LockOptions,
    callback: (lock: Lock | null) => Promise<void>,
  ) => Promise<void>
}

export const LOCK_TIMEOUT: Duration.Input = "10 seconds"

const untilAborted = (signal: AbortSignal): Promise<void> =>
  signal.aborted
    ? Promise.resolve()
    : new Promise((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }))

/**
 * Web: after a full navigation Chrome keeps the previous page in the back/forward cache, and its
 * sqlite worker keeps the OPFS access handle, so this page's open fails ("Access Handles cannot
 * be created…") and `ManagedRuntime` caches that failure for the page's life. Every page holds
 * the Web Lock named after the database for its whole life: requesting it evicts a cached page
 * that holds it. A second live tab waits `LOCK_TIMEOUT`, then fails with `DatabaseInUse`.
 * One controller per page: aborting it (interrupted wait, failed open, scope close) cancels a
 * pending request (even one granted late: the grant callback sees the abort) and releases a
 * granted lock. Returns that release action.
 */
const holdDatabaseLock = (locks: DatabaseLocks) =>
  Effect.gen(function* () {
    const controller = yield* Effect.acquireRelease(
      Effect.sync(() => new AbortController()),
      (held) => Effect.sync(() => held.abort()),
    )
    const release = Effect.sync(() => controller.abort())
    yield* Effect.callback<void, StoreError>((resume) => {
      locks
        .request(DATABASE_NAME, { signal: controller.signal }, () => {
          resume(Effect.void)
          return untilAborted(controller.signal)
        })
        .catch((cause: unknown) => resume(Effect.fail(new StoreError({ cause }))))
      return release
    }).pipe(
      Effect.timeoutOrElse({
        duration: LOCK_TIMEOUT,
        orElse: () => Effect.fail(new DatabaseInUse({ lockName: DATABASE_NAME })),
      }),
    )
    return release
  })

/** The bfcached page's OPFS handle ("Access Handles cannot be created…"); expo-sqlite's worker
 * channel keeps only the message, so the class is matched on it. */
export const isAccessHandleError = (error: StoreError): boolean =>
  error.cause instanceof Error && /access handle/i.test(error.cause.message)

/**
 * Takes the page lock (when the platform has Web Locks), then opens. The evicted page's worker
 * shuts down asynchronously, so only that failure is retried, for up to ~5 s. A failed open
 * releases the lock at once, so other tabs are not blocked while this page stays open.
 */
export const openPageStore = <A, R>(
  locks: Option.Option<DatabaseLocks>,
  open: Effect.Effect<A, StoreError, R>,
): Effect.Effect<A, StoreError | DatabaseInUse, R | Scope.Scope> =>
  Option.match(locks, { onNone: () => Effect.succeed(Effect.void), onSome: holdDatabaseLock }).pipe(
    Effect.flatMap((release) =>
      open.pipe(
        Effect.retry({
          schedule: Schedule.spaced("250 millis"),
          times: 20,
          while: isAccessHandleError,
        }),
        Effect.onError(() => release),
      ),
    ),
  )

/** Native has no `navigator.locks`; `LockManager` assigns to `DatabaseLocks`. */
const PageSqlDriver = Layer.effectContext(
  Effect.suspend(() =>
    openPageStore(
      Option.fromNullishOr(typeof navigator === "undefined" ? undefined : navigator.locks),
      Layer.build(SqlDriver.layer),
    ),
  ),
)

/** Shared infrastructure, exposed so later services (sync) reuse the same database handle. */
export const BaseLayer = Layer.mergeAll(
  LocalStore.layerNoDeps.pipe(Layer.provideMerge(Layer.mergeAll(PageSqlDriver, StoreEvents.layer))),
  AppIdGenerator,
  DateTime.layerCurrentZoneLocal,
)

/**
 * Signed out: seed the demo plan on first run. Signed in: re-key `LOCAL_USER_ID` rows to the user
 * (a no-op once done). Runs while the runtime is built, so the sync loop (`useSync`, a runtime
 * caller) cannot start before the re-key batch has committed.
 */
const startup = Effect.gen(function* () {
  yield* seedIfEmpty
  const signedIn = yield* CurrentUser.use((user) => user.signedIn)
  yield* Option.match(signedIn, {
    onNone: () => Effect.void,
    onSome: (userId) => SyncEngine.use((engine) => engine.rekeyLocalUser(userId)),
  })
})

/**
 * Building it opens the database, migrates, resolves the signed-in user and runs `startup`. Sync
 * talks to the worker over HTTP (`apiBaseUrl`) and shares the store's database handle.
 */
export const AppLayer = Layer.effectDiscard(startup).pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      TodayRepo.layerNoDeps,
      PlanWeekRepo.layer,
      SyncEngine.layerNoDeps.pipe(Layer.provide(SyncTransport.layer)),
    ),
  ),
  Layer.provideMerge(CurrentUser.layer),
  Layer.provideMerge(BaseLayer),
)

/** The app's single runtime, built once on first use. Hooks are its only callers. */
export const runtime = ManagedRuntime.make(AppLayer)

const GENERIC_FAILURE = "Something went wrong."

/** A short, user-facing message for a failed run: no stack traces in the UI. */
export const failureMessage = (cause: Cause.Cause<unknown>): string =>
  Option.match(Cause.findErrorOption(cause), {
    onNone: () => GENERIC_FAILURE,
    onSome: (error) =>
      Predicate.isTagged(error, "ValidationError")
        ? "That set is not valid. Check weight and reps."
        : Predicate.isTagged(error, "DatabaseInUse")
          ? "Tanren is open in another tab. Close it and reload this page."
          : Predicate.isTagged(error, "StoreError")
            ? "Could not save on this device. Try again."
            : GENERIC_FAILURE,
  })
