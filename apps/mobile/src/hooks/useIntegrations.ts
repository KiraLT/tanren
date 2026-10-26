import type { ActivityExportId, IntegrationsStatus, ProviderStatus } from "@tanren/shared"
import { Array as Arr, Cause, DateTime, Effect, Exit, Option, Predicate } from "effect"
import { useFocusEffect } from "expo-router"
import { useCallback, useRef, useState } from "react"
import { type ExportRowCopy, exportRow, isBlocked } from "../components/settings/integrationsCopy"
import { FeedRepo } from "../services/FeedRepo"
import {
  Integrations,
  type IntegrationsFailure,
  openAuthorizeUrl,
  platformReturnTo,
} from "../services/Integrations"
import { runtime } from "../services/runtime"

export const RECENT_EXPORTS = 20

export type LoadState<A> =
  | { readonly _tag: "Loading" }
  | { readonly _tag: "Failed"; readonly reason: IntegrationsFailure }
  | { readonly _tag: "Ready"; readonly value: A }

export interface IntegrationsOverview {
  readonly strava: ProviderStatus
  readonly zone: DateTime.TimeZone
}

export interface StravaDetail extends IntegrationsOverview {
  readonly rows: ReadonlyArray<ExportRowCopy>
  readonly blocked: boolean
}

/** What a button press is doing now, or why the last one failed. */
export type ActionState =
  | { readonly _tag: "Idle" }
  | { readonly _tag: "Busy"; readonly action: "connect" | "disconnect" | ActivityExportId }
  | { readonly _tag: "Failed"; readonly reason: IntegrationsFailure }

/** The server always lists every provider; a missing one reads as disconnected. */
const stravaOf = (status: IntegrationsStatus): ProviderStatus =>
  Option.getOrElse(
    Arr.findFirst(status.providers, (provider) => provider.provider === "strava"),
    (): ProviderStatus => ({
      provider: "strava",
      state: "disconnected",
      account: Option.none(),
      connectedAt: Option.none(),
      lastExportAt: Option.none(),
      pendingExports: 0,
      failedExports: 0,
      blockedExports: 0,
    }),
  )

const loadOverview = Effect.gen(function* () {
  const status = yield* Integrations.use((service) => service.status)
  const zone = yield* DateTime.CurrentTimeZone
  return { strava: stravaOf(status), zone } satisfies IntegrationsOverview
})

const loadDetail = Effect.gen(function* () {
  const { strava, zone } = yield* loadOverview
  const exports = yield* Integrations.use((service) => service.exports(RECENT_EXPORTS)).pipe(
    Effect.catchTag("IntegrationsRequestFailed", (failure) =>
      failure.reason === "not-connected" ? Effect.succeed([]) : Effect.fail(failure),
    ),
  )
  // The local store names the session; a store failure only loses the names.
  const rows = yield* Effect.forEach(exports, (row) =>
    FeedRepo.use((feed) => feed.activity(row.sessionId)).pipe(
      Effect.orElseSucceed(() => Option.none()),
      Effect.map((activity) => exportRow(row, activity, zone)),
    ),
  )
  return { strava, zone, rows, blocked: isBlocked(strava, exports) } satisfies StravaDetail
})

const reasonOf = (cause: Cause.Cause<unknown>): IntegrationsFailure =>
  Option.match(Cause.findErrorOption(cause), {
    onNone: () => "server",
    onSome: (failure) =>
      Predicate.isTagged(failure, "IntegrationsRequestFailed") &&
      Predicate.hasProperty(failure, "reason") &&
      (failure.reason === "offline" || failure.reason === "not-connected")
        ? failure.reason
        : "server",
  })

/** Runs an Integrations effect on the app runtime with the service's own layer. */
const run = <A, E>(
  effect: Effect.Effect<A, E, Integrations | FeedRepo | DateTime.CurrentTimeZone>,
  signal?: AbortSignal,
) =>
  runtime.runPromiseExit(
    effect.pipe(Effect.provide(Integrations.layer)),
    signal === undefined ? undefined : { signal },
  )

/** Loads on every focus (the provider round trip returns to a refocused screen). */
const useFocusLoad = <A>(
  load: Effect.Effect<A, unknown, Integrations | FeedRepo | DateTime.CurrentTimeZone>,
) => {
  const [state, setState] = useState<LoadState<A>>({ _tag: "Loading" })
  const [version, setVersion] = useState(0)
  const reload = useCallback(() => setVersion((current) => current + 1), [])
  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController()
      run(load, controller.signal).then((exit) => {
        if (controller.signal.aborted) return
        setState(
          Exit.isSuccess(exit)
            ? { _tag: "Ready", value: exit.value }
            : { _tag: "Failed", reason: reasonOf(exit.cause) },
        )
      })
      return () => controller.abort()
      // `version` re-runs the load on demand (Retry, after an action).
    }, [load, version]),
  )
  return { state, reload, setLoading: () => setState({ _tag: "Loading" }) }
}

/** Settings row and the Integrations list: every provider's status. */
export const useIntegrationsOverview = () => {
  const { state, reload, setLoading } = useFocusLoad(loadOverview)
  return {
    state,
    retry: () => {
      setLoading()
      reload()
    },
  }
}

/** Strava detail: status, recent exports, and the connect / disconnect / retry actions. */
export const useStravaDetail = () => {
  const { state, reload, setLoading } = useFocusLoad(loadDetail)
  const [action, setAction] = useState<ActionState>({ _tag: "Idle" })
  const busy = useRef(false)

  const perform = useCallback(
    (
      name: "connect" | "disconnect" | ActivityExportId,
      effect: Effect.Effect<unknown, unknown, Integrations | FeedRepo | DateTime.CurrentTimeZone>,
      after: "reload" | "stay",
    ) => {
      if (busy.current) return
      // biome-ignore lint/plugin/noMutation: React ref flag guarding double taps, not shared state
      busy.current = true
      setAction({ _tag: "Busy", action: name })
      run(effect).then((exit) => {
        // biome-ignore lint/plugin/noMutation: React ref flag guarding double taps, not shared state
        busy.current = false
        if (Exit.isFailure(exit)) {
          setAction({ _tag: "Failed", reason: reasonOf(exit.cause) })
          return
        }
        setAction({ _tag: "Idle" })
        if (after === "reload") reload()
      })
    },
    [reload],
  )

  const connect = useCallback(
    () =>
      perform(
        "connect",
        Effect.gen(function* () {
          const returnTo = yield* platformReturnTo
          const url = yield* Integrations.use((service) => service.connect(returnTo))
          yield* openAuthorizeUrl(url)
        }),
        "stay",
      ),
    [perform],
  )
  const disconnect = useCallback(
    () =>
      perform(
        "disconnect",
        Integrations.use((service) => service.disconnect),
        "reload",
      ),
    [perform],
  )
  const retryExport = useCallback(
    (id: ActivityExportId) =>
      perform(
        id,
        Integrations.use((service) => service.retry(id)),
        "reload",
      ),
    [perform],
  )

  return {
    state,
    action,
    connect,
    disconnect,
    retryExport,
    retry: () => {
      setLoading()
      reload()
    },
  }
}
