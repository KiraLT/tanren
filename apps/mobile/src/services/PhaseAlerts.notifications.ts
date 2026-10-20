import { DateTime, Effect, Semaphore } from "effect"
import type { PhaseAlertsShape } from "./PhaseAlerts"

/**
 * The slice of `expo-notifications` the adapter uses, so tests pass a fake. `loadNotificationsApi`
 * builds the real one; every method may reject.
 */
export interface NotificationsApi {
  /** Asks the OS once; `true` when local notifications may be shown. */
  readonly requestPermission: () => Promise<boolean>
  /** One local notification `seconds` (≥ 1) from now. */
  readonly scheduleIn: (seconds: number, text: string) => Promise<unknown>
  readonly cancelAll: () => Promise<void>
}

/** Whole seconds from `now` until `at`, at least 1 (the TIME_INTERVAL trigger rejects 0). */
export const secondsUntil = (now: DateTime.Utc, at: DateTime.Utc): number =>
  Math.max(1, Math.ceil((DateTime.toEpochMillis(at) - DateTime.toEpochMillis(now)) / 1000))

/** Logs and swallows: an alert is a convenience, never a reason to fail the player. */
const attempt = (label: string, run: () => Promise<unknown>): Effect.Effect<void> =>
  Effect.tryPromise(run).pipe(
    Effect.asVoid,
    Effect.catch((cause) => Effect.logWarning(`PhaseAlerts: ${label} failed`, cause)),
  )

/**
 * `PhaseAlerts` over local notifications: permission is asked lazily, once, on the first
 * `schedule` (denied or failed → every later `schedule` is a no-op); `schedule` cancels the
 * pending one first, so at most one is pending. Calls are serialised.
 */
export const notificationAlerts = (api: NotificationsApi): Effect.Effect<PhaseAlertsShape> =>
  Effect.gen(function* () {
    const lock = yield* Semaphore.make(1)
    const permitted = yield* Effect.cached(
      Effect.tryPromise(api.requestPermission).pipe(
        Effect.catch((cause) =>
          Effect.logWarning("PhaseAlerts: permission request failed", cause).pipe(Effect.as(false)),
        ),
      ),
    )
    const cancelAll = attempt("cancel", api.cancelAll)
    const schedule = (at: DateTime.Utc, text: string) =>
      lock.withPermits(1)(
        Effect.gen(function* () {
          if (!(yield* permitted)) {
            return
          }
          yield* cancelAll
          const seconds = secondsUntil(yield* DateTime.now, at)
          yield* attempt("schedule", () => api.scheduleIn(seconds, text))
        }),
      )
    return { schedule, cancelAll: lock.withPermits(1)(cancelAll) }
  })

/**
 * The real API, imported lazily so Node tests (and modules that only need the port) never load
 * the native module. iOS `PROVISIONAL` (quiet delivery) counts as permitted.
 */
export const loadNotificationsApi: Effect.Effect<NotificationsApi, unknown> = Effect.tryPromise(
  () => import("expo-notifications"),
).pipe(
  Effect.map(
    (Notifications): NotificationsApi => ({
      requestPermission: () =>
        Notifications.requestPermissionsAsync().then(
          (status) =>
            status.granted ||
            status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL,
        ),
      scheduleIn: (seconds, text) =>
        Notifications.scheduleNotificationAsync({
          content: { body: text },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds },
        }),
      cancelAll: () => Notifications.cancelAllScheduledNotificationsAsync(),
    }),
  ),
)
