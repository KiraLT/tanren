import { IdGenerator, Uuid } from "@tanren/shared"
import { Cause, DateTime, Effect, Layer, ManagedRuntime, Option, Predicate, Schedule } from "effect"
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
 * Web: after a full navigation Chrome keeps the previous page in the back/forward cache, and its
 * sqlite worker keeps the OPFS access handle, so this page's open fails ("Access Handles cannot
 * be created…") and `ManagedRuntime` caches that failure for the page's life. Every page holds
 * the Web Lock named after the database for its whole life: requesting it evicts a cached page
 * that holds it. A second live tab waits up to 10 s, then fails. Native has no `navigator.locks`.
 */
const holdDatabaseLock = Effect.callback<void, StoreError>((resume) => {
  if (typeof navigator === "undefined" || navigator.locks === undefined) {
    resume(Effect.void)
    return
  }
  navigator.locks
    .request(DATABASE_NAME, { signal: AbortSignal.timeout(10_000) }, () => {
      resume(Effect.void)
      return new Promise<never>(() => {})
    })
    .catch((cause: unknown) => resume(Effect.fail(new StoreError({ cause }))))
})

/** The evicted page's worker shuts down asynchronously, so the open is retried for up to ~5 s. */
const PageSqlDriver = Layer.effectContext(
  holdDatabaseLock.pipe(
    Effect.andThen(
      Layer.build(SqlDriver.layer).pipe(
        Effect.retry({ schedule: Schedule.spaced("250 millis"), times: 20 }),
      ),
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
        : Predicate.isTagged(error, "StoreError")
          ? "Could not save on this device. Try again."
          : GENERIC_FAILURE,
  })
