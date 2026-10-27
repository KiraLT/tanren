import type { ActivityExportId, IntegrationsStatus, Provider, ProviderStatus } from "@tanren/shared"
import { Array as Arr, Cause, DateTime, Effect, Exit, Option, Predicate } from "effect"
import { useFocusEffect } from "expo-router"
import { useCallback, useRef, useState } from "react"
import {
  type ExportRowCopy,
  exportRow,
  type GarminRejectReason,
  isBlocked,
} from "../components/settings/integrationsCopy"
import { isTrackerConnected } from "../components/today/healthModuleMath"
import { type CurrentUser, whenSignedIn } from "../services/CurrentUser"
import { FeedRepo } from "../services/FeedRepo"
import {
  GARMIN_CONNECT_RELOAD,
  Integrations,
  type IntegrationsFailure,
  openAuthorizeUrl,
  platformReturnTo,
  type ReloadPolicy,
  shouldReload,
} from "../services/Integrations"
import { NutritionRepo } from "../services/NutritionRepo"
import { runtime } from "../services/runtime"
import { type StoreRead, useStoreRead } from "./useHistory"

export const RECENT_EXPORTS = 20

export type LoadState<A> =
  | { readonly _tag: "Loading" }
  | { readonly _tag: "Failed"; readonly reason: IntegrationsFailure }
  | { readonly _tag: "Ready"; readonly value: A }

export interface IntegrationsOverview {
  readonly strava: ProviderStatus
  readonly garmin: ProviderStatus
  readonly zone: DateTime.TimeZone
}

export interface StravaDetail extends IntegrationsOverview {
  readonly rows: ReadonlyArray<ExportRowCopy>
  readonly blocked: boolean
}

/**
 * What a button press is doing now, or why the last one failed. `Rejected` is Garmin's token
 * verdict (`GarminTokenRejected.reason`); Strava never produces it.
 */
export type ActionState =
  | { readonly _tag: "Idle" }
  | { readonly _tag: "Busy"; readonly action: "connect" | "disconnect" | ActivityExportId }
  | { readonly _tag: "Failed"; readonly reason: IntegrationsFailure; readonly action: ActionName }
  | { readonly _tag: "Rejected"; readonly reason: GarminRejectReason; readonly action: ActionName }

export type ActionName = "connect" | "disconnect" | ActivityExportId

const STAY: ReloadPolicy = { onSuccess: false, onFailure: false }
const RELOAD_ON_SUCCESS: ReloadPolicy = { onSuccess: true, onFailure: false }

/** The server always lists every provider; a missing one reads as disconnected. */
export const providerOf = (status: IntegrationsStatus, provider: Provider): ProviderStatus =>
  Option.getOrElse(
    Arr.findFirst(status.providers, (row) => row.provider === provider),
    (): ProviderStatus => ({
      provider,
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
  return {
    strava: providerOf(status, "strava"),
    garmin: providerOf(status, "garmin"),
    zone,
  } satisfies IntegrationsOverview
})

const loadDetail = Effect.gen(function* () {
  const overview = yield* loadOverview
  const exports = yield* Integrations.use((service) => service.exports(RECENT_EXPORTS)).pipe(
    Effect.catchTag("IntegrationsRequestFailed", (failure) =>
      failure.reason === "not-connected" ? Effect.succeed([]) : Effect.fail(failure),
    ),
  )
  // The local store names the session; a store failure only loses the names.
  const rows = yield* Effect.forEach(exports, (row) =>
    FeedRepo.use((feed) => feed.activity(row.sessionId)).pipe(
      Effect.orElseSucceed(() => Option.none()),
      Effect.map((activity) => exportRow(row, activity, overview.zone)),
    ),
  )
  return {
    ...overview,
    rows,
    blocked: isBlocked(overview.strava, exports),
  } satisfies StravaDetail
})

const reasonOf = (cause: Cause.Cause<unknown>): IntegrationsFailure =>
  Option.match(Cause.findErrorOption(cause), {
    onNone: () => "server",
    onSome: (failure) =>
      Predicate.isTagged(failure, "IntegrationsRequestFailed") &&
      Predicate.hasProperty(failure, "reason") &&
      (failure.reason === "offline" ||
        failure.reason === "not-connected" ||
        failure.reason === "not-configured")
        ? failure.reason
        : "server",
  })

const REJECT_REASONS: ReadonlyArray<unknown> = ["rejected", "not-configured", "unreachable"]

const isRejectReason = (value: unknown): value is GarminRejectReason =>
  REJECT_REASONS.includes(value)

/** A failed action: Garmin's token verdict keeps its reason; anything else is a request failure. */
const failedActionOf = (cause: Cause.Cause<unknown>, action: ActionName): ActionState =>
  Option.match(
    Option.flatMap(Cause.findErrorOption(cause), (failure) =>
      Predicate.isTagged(failure, "GarminTokenRejected") &&
      Predicate.hasProperty(failure, "reason") &&
      isRejectReason(failure.reason)
        ? Option.some(failure.reason)
        : Option.none(),
    ),
    {
      onNone: (): ActionState => ({ _tag: "Failed", reason: reasonOf(cause), action }),
      onSome: (reason): ActionState => ({ _tag: "Rejected", reason, action }),
    },
  )

type Requirements = Integrations | FeedRepo | DateTime.CurrentTimeZone | CurrentUser

/** Runs an Integrations effect on the app runtime with the service's own layer. */
const run = <A, E>(effect: Effect.Effect<A, E, Requirements>, signal?: AbortSignal) =>
  runtime.runPromiseExit(
    effect.pipe(Effect.provide(Integrations.layer)),
    signal === undefined ? undefined : { signal },
  )

/** Loads on every focus (the provider round trip returns to a refocused screen). */
const useFocusLoad = <A>(load: Effect.Effect<A, unknown, Requirements>) => {
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

/** One action at a time (a ref guards double taps); reloads the page after when asked. */
const useActions = (reload: () => void) => {
  const [action, setAction] = useState<ActionState>({ _tag: "Idle" })
  const busy = useRef(false)
  const perform = useCallback(
    (
      name: ActionName,
      effect: Effect.Effect<unknown, unknown, Requirements>,
      policy: ReloadPolicy,
    ) => {
      if (busy.current) return
      // biome-ignore lint/plugin/noMutation: React ref flag guarding double taps, not shared state
      busy.current = true
      setAction({ _tag: "Busy", action: name })
      run(effect).then((exit) => {
        // biome-ignore lint/plugin/noMutation: React ref flag guarding double taps, not shared state
        busy.current = false
        if (Exit.isFailure(exit)) {
          setAction(failedActionOf(exit.cause, name))
          if (shouldReload(policy, "failure")) reload()
          return
        }
        setAction({ _tag: "Idle" })
        if (shouldReload(policy, "success")) reload()
      })
    },
    [reload],
  )
  return { action, perform }
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

/**
 * True once the server reports Garmin connected; false while loading, offline or disconnected. The
 * health module's "Waiting for Garmin" vs "No tracker connected" (health-module.md §6).
 */
export const useGarminConnected = (): boolean => {
  const { state } = useFocusLoad(loadGarminConnected)
  return state._tag === "Ready" && state.value
}

/** Signed out: `false` without asking the worker (Home sits behind the web landing, NAV-F2). */
const loadGarminConnected = whenSignedIn(
  loadOverview.pipe(Effect.map((overview) => overview.garmin.state === "connected")),
  false,
)

/** Module-level reader: stable identity for `useStoreRead`. */
const readHasDailyHealth: StoreRead<undefined, boolean> = () =>
  NutritionRepo.use((repo) => repo.hasDailyHealth)

/**
 * Garmin connected per the server, or any live local `daily_health` row (offline / loading
 * fallback, `isTrackerConnected`): the health module's "Waiting for Garmin" vs "No tracker
 * connected" (health-module.md §6).
 */
export const useTrackerConnected = (): boolean => {
  const garminConnected = useGarminConnected()
  const { state } = useStoreRead(readHasDailyHealth, undefined)
  return isTrackerConnected(garminConnected, state._tag === "Ready" && state.value)
}

/** Strava detail: status, recent exports, and the connect / disconnect / retry actions. */
export const useStravaDetail = () => {
  const { state, reload, setLoading } = useFocusLoad(loadDetail)
  const { action, perform } = useActions(reload)

  const connect = useCallback(
    () =>
      perform(
        "connect",
        Effect.gen(function* () {
          const returnTo = yield* platformReturnTo
          const url = yield* Integrations.use((service) => service.connect(returnTo))
          yield* openAuthorizeUrl(url)
        }),
        STAY,
      ),
    [perform],
  )
  const disconnect = useCallback(
    () =>
      perform(
        "disconnect",
        Integrations.use((service) => service.disconnect),
        RELOAD_ON_SUCCESS,
      ),
    [perform],
  )
  const retryExport = useCallback(
    (id: ActivityExportId) =>
      perform(
        id,
        Integrations.use((service) => service.retry(id)),
        RELOAD_ON_SUCCESS,
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

/**
 * Garmin detail: status plus paste-token connect and disconnect. The token is passed straight to
 * the service and not kept here (the card owns and clears it).
 */
export const useGarminDetail = () => {
  const { state, reload, setLoading } = useFocusLoad(loadOverview)
  const { action, perform } = useActions(reload)

  const connect = useCallback(
    (token: string) =>
      perform(
        "connect",
        Integrations.use((service) => service.connectGarmin(token)),
        GARMIN_CONNECT_RELOAD,
      ),
    [perform],
  )
  const disconnect = useCallback(
    () =>
      perform(
        "disconnect",
        Integrations.use((service) => service.disconnectGarmin),
        RELOAD_ON_SUCCESS,
      ),
    [perform],
  )

  return {
    state,
    action,
    connect,
    disconnect,
    retry: () => {
      setLoading()
      reload()
    },
  }
}
