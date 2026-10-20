import { Context, type DateTime, Effect, Layer, Ref } from "effect"
import { loadNotificationsApi, notificationAlerts } from "./PhaseAlerts.notifications"

export interface PhaseAlertsShape {
  /** One alert at `at` (replaces a pending one). Never fails: errors are logged and dropped. */
  readonly schedule: (at: DateTime.Utc, text: string) => Effect.Effect<void>
  /** Drops the pending alert, if any. Never fails. */
  readonly cancelAll: Effect.Effect<void>
}

/** What `layerTest` recorded, in call order. */
export type PhaseAlertCall =
  | { readonly _tag: "Schedule"; readonly at: DateTime.Utc; readonly text: string }
  | { readonly _tag: "CancelAll" }

/** Reads `PhaseAlerts.layerTest`'s recorded calls. */
export class PhaseAlertsLog extends Context.Service<
  PhaseAlertsLog,
  { readonly calls: Effect.Effect<ReadonlyArray<PhaseAlertCall>> }
>()("@tanren/PhaseAlertsLog") {}

const noop: PhaseAlertsShape = { schedule: () => Effect.void, cancelAll: Effect.void }

/**
 * The player's phase-end alert port (v2-programs.md §4): local notifications in Expo Go, nothing
 * on web; the Live Activity (P7) is a second implementation.
 */
export class PhaseAlerts extends Context.Service<PhaseAlerts, PhaseAlertsShape>()(
  "@tanren/PhaseAlerts",
) {
  static readonly layerNoop = Layer.succeed(this, this.of(noop))

  /**
   * Native: the notifications adapter; web: no-op. `react-native` and `expo-notifications` are
   * imported while the layer is built (never in Node tests); a failed import degrades to no-op.
   */
  static readonly layer = Layer.effect(
    this,
    Effect.tryPromise(() => import("react-native")).pipe(
      Effect.flatMap(({ Platform }) =>
        Platform.OS === "web"
          ? Effect.succeed(noop)
          : loadNotificationsApi.pipe(Effect.flatMap(notificationAlerts)),
      ),
      Effect.catch((cause) =>
        Effect.logWarning("PhaseAlerts: notifications unavailable", cause).pipe(Effect.as(noop)),
      ),
    ),
  )

  /** Records every call (read them with `PhaseAlertsLog`); does nothing else. */
  static readonly layerTest = Layer.effectContext(
    Ref.make<ReadonlyArray<PhaseAlertCall>>([]).pipe(
      Effect.map((ref) => {
        const record = (call: PhaseAlertCall) => Ref.update(ref, (calls) => [...calls, call])
        return Context.make(
          PhaseAlerts,
          PhaseAlerts.of({
            schedule: (at, text) => record({ _tag: "Schedule", at, text }),
            cancelAll: record({ _tag: "CancelAll" }),
          }),
        ).pipe(Context.add(PhaseAlertsLog, PhaseAlertsLog.of({ calls: Ref.get(ref) })))
      }),
    ),
  )
}
