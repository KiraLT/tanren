import type {
  ActivityExport,
  ActivityExportId,
  ExportFailureReason,
  ExportStatus,
  GarminTokenRejected,
  Provider,
  ProviderStatus,
} from "@tanren/shared"
import { DateTime, Match, Option } from "effect"
import type { IconName, Tone } from "../../ui"

/** Pill label and tone (StatusPill has no warning tone: problems are `danger`). */
export interface PillCopy {
  readonly label: string
  readonly tone: Tone
}

export interface ProviderRowCopy {
  readonly title: string
  readonly pill: PillCopy
  readonly subtitle: string
  /** "<provider>, <state>" (design §8). */
  readonly accessibilityLabel: string
}

export const PROVIDER_NAMES: { readonly [P in Provider]: string } = {
  strava: "Strava",
  garmin: "Garmin",
}

export const BLOCKED_COPY = "Strava app inactive — resubscribe on strava.com"
export const IDLE_SUBTITLE = "Exports finished sessions"
export const REVOKED_SUBTITLE = "Strava stopped accepting Tanren. Connect again"
export const DETAIL_BODY =
  "Finished sessions are posted as 'Weight Training' activities. One way; Tanren never reads your Strava data."
/** Shown while production runs the console provider (no registered Strava app yet). */
export const GO_LIVE_NOTE = "Strava connection goes live after the owner registers the app."

/** The detail card's extra line: the go-live note for a disconnected provider only. */
export const detailNote = (status: Pick<ProviderStatus, "state">): Option.Option<string> =>
  status.state === "disconnected" ? Option.some(GO_LIVE_NOTE) : Option.none()

export const NOT_CONNECTED_TITLE = "Not connected"
export const REVOKED_TITLE = "Access ended"
export const CONNECT_LABEL = "Connect with Strava"
export const DISCONNECT_LABEL = "Disconnect Strava"
export const VIEW_ON_STRAVA = "View on Strava"
export const PENDING_SUBTITLE = "Exports within 5 minutes"
export const EXPORTS_EMPTY_TITLE = "No exports yet"
export const EXPORTS_EMPTY_BODY = "Finish a session and it shows up here"
export const SESSION_FALLBACK = "Session"
export const APPLE_HEALTH = { title: "Apple Health", pill: "Needs app build" } as const
export const ABOUT_TITLE = "About integrations"
/** Which page the About card sits on: the Integrations list or one provider's detail. */
export type AboutScope = "list" | Provider

/**
 * The About card's text per page. Strava is export-only; Garmin imports (design §10), so neither the
 * list nor the Garmin page may claim that Tanren never reads data back.
 */
export const ABOUT_BODIES: { readonly [S in AboutScope]: string } = {
  list: "Strava receives your finished sessions; Tanren never reads Strava data. Garmin imports your own activities and daily summaries, read-only, never shared or used by the AI planning tools.",
  strava:
    "Integrations send finished sessions to other apps. Tanren only writes; it never reads data back.",
  garmin:
    "Tanren imports your own Garmin activities and daily summaries (calories, steps, resting heart rate). Read-only: never shared with third parties or used by the AI planning tools. Disconnecting removes the token and the imported data.",
}

/** Garmin's personal-API-token page (a constant: the UI never links anything else). */
export const GARMIN_TOKEN_URL = "https://connect.garmin.com/app/settings/personalApiToken"
/** The connect button stays disabled until the trimmed token is this long (`GarminConnectRequest`). */
export const GARMIN_MIN_TOKEN_LENGTH = 16

/** Garmin copy, design §8 (verbatim). */
export const GARMIN = {
  /** Two lines at 390 like Strava's row (GM-D: "your own" made it wrap to three). */
  idleSubtitle: "Imports runs, rides and daily calories",
  firstImport: "First import within 5 minutes",
  revokedTitle: "Token rejected",
  revokedBody: "Garmin stopped accepting the token. Paste a new one",
  body: "Paste your personal API token. Tanren checks it once, stores it encrypted and imports your activities and daily calories.",
  placeholder: "Personal API token",
  tokenLink: "Get a token at connect.garmin.com → Settings",
  connect: "Connect Garmin",
  /** Garmin connect can take up to 30 s (`GARMIN_CONNECT_TIMEOUT_SECONDS`): say so while it runs. */
  connecting: "Connecting… up to 30 s",
  disconnect: "Disconnect Garmin",
  expiry: "Garmin tokens expire 30–365 days after creation; renew at connect.garmin.com",
  notConnected: "Garmin is not connected",
} as const

/** True once the pasted token, trimmed, is long enough to send. */
export const canSubmitToken = (raw: string): boolean => raw.trim().length >= GARMIN_MIN_TOKEN_LENGTH

export type GarminRejectReason = GarminTokenRejected["reason"]

/** `GarminTokenRejected.reason` → the card's danger banner (design §8). */
export const GARMIN_REJECT_COPY: { readonly [R in GarminRejectReason]: string } = {
  rejected: "Garmin did not accept this token",
  "not-configured": "Garmin connection goes live after the owner enables it",
  unreachable: "Garmin did not answer. Try again",
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const

const pad2 = (value: number): string => String(value).padStart(2, "0")

/** "26 Oct" in `zone`. */
export const formatDay = (at: DateTime.DateTime, zone: DateTime.TimeZone): string => {
  const parts = DateTime.toParts(DateTime.setZone(at, zone))
  return `${parts.day} ${MONTHS[parts.month - 1] ?? ""}`
}

/** "26 Oct, 19:40" in `zone`. */
export const formatDayTime = (at: DateTime.DateTime, zone: DateTime.TimeZone): string => {
  const parts = DateTime.toParts(DateTime.setZone(at, zone))
  return `${formatDay(at, zone)}, ${pad2(parts.hour)}:${pad2(parts.minute)}`
}

const connectedRow = (status: ProviderStatus, zone: DateTime.TimeZone) => {
  if (status.blockedExports > 0) {
    return { pill: { label: "Blocked", tone: "danger" as const }, subtitle: BLOCKED_COPY }
  }
  const subtitle =
    status.failedExports > 0
      ? `${status.failedExports} failed`
      : Option.match(status.lastExportAt, {
          onNone: () => IDLE_SUBTITLE,
          onSome: (at) => `Last export ${formatDayTime(at, zone)}`,
        })
  return { pill: { label: "Connected", tone: "success" as const }, subtitle }
}

/** Garmin's row (design §8): an import provider, so its copy speaks of imports, not exports. */
const garminRow = (status: ProviderStatus, zone: DateTime.TimeZone) =>
  ({
    connected: () => ({
      pill: { label: "Connected", tone: "accent" as const },
      subtitle: Option.match(
        Option.flatMap(Option.fromNullishOr(status.imports), (imports) => imports.lastPullAt),
        {
          onNone: () => GARMIN.firstImport,
          onSome: (at) => `Last import ${formatDayTime(at, zone)}`,
        },
      ),
    }),
    revoked: () => ({
      pill: { label: GARMIN.revokedTitle, tone: "danger" as const },
      subtitle: GARMIN.revokedBody,
    }),
    disconnected: () => ({
      pill: { label: "Not connected", tone: "neutral" as const },
      subtitle: GARMIN.idleSubtitle,
    }),
  })[status.state]()

/** The provider's list row: pill + subtitle. Blocked wins over failed; failed over last export. */
export const providerRow = (status: ProviderStatus, zone: DateTime.TimeZone): ProviderRowCopy => {
  const title = PROVIDER_NAMES[status.provider]
  const { pill, subtitle } =
    status.provider === "garmin" ? garminRow(status, zone) : stravaRow(status, zone)
  return { title, pill, subtitle, accessibilityLabel: `${title}, ${pill.label}` }
}

const stravaRow = (status: ProviderStatus, zone: DateTime.TimeZone) =>
  ({
    connected: () => connectedRow(status, zone),
    revoked: () => ({
      pill: { label: "Reconnect", tone: "danger" as const },
      subtitle: REVOKED_SUBTITLE,
    }),
    disconnected: () => ({
      pill: { label: "Not connected", tone: "neutral" as const },
      subtitle: IDLE_SUBTITLE,
    }),
  })[status.state]()

/** Settings row subtitle: "Strava · Connected"; just "Strava" while unknown. */
export const settingsSubtitle = (
  overview: Option.Option<{ readonly strava: ProviderStatus; readonly zone: DateTime.TimeZone }>,
): string =>
  Option.match(overview, {
    onNone: () => PROVIDER_NAMES.strava,
    onSome: ({ strava, zone }) =>
      `${PROVIDER_NAMES[strava.provider]} · ${providerRow(strava, zone).pill.label}`,
  })

/** The detail card's headline. */
export const detailHeadline = (status: ProviderStatus): string =>
  ({
    connected: () =>
      Option.match(status.account, {
        onNone: () => "Connected",
        onSome: ({ displayName }) => `Connected as ${displayName}`,
      }),
    revoked: () => REVOKED_TITLE,
    disconnected: () => NOT_CONNECTED_TITLE,
  })[status.state]()

/** The banner a return from the provider leaves (`?connected=strava` / `?error=…`). */
export interface ReturnBanner {
  readonly tone: "success" | "danger"
  readonly title: string
}

const RETURN_ERRORS: Readonly<Record<string, string>> = {
  denied: "Strava access was declined",
  scope:
    "Tanren needs permission to create activities. Connect again and keep 'Upload your activities' ticked",
  provider: "Strava did not answer. Try again",
}

const single = (value: string | ReadonlyArray<string> | undefined): Option.Option<string> =>
  typeof value === "string" ? Option.some(value) : Option.none()

/** Reads the return params; unknown or repeated values show nothing. */
export const returnBanner = (params: {
  readonly connected?: string | ReadonlyArray<string> | undefined
  readonly error?: string | ReadonlyArray<string> | undefined
}): Option.Option<ReturnBanner> =>
  Option.orElse(
    Option.flatMap(single(params.error), (error) =>
      Option.map(
        Option.fromNullishOr(RETURN_ERRORS[error]),
        (title): ReturnBanner => ({ tone: "danger", title }),
      ),
    ),
    () =>
      Option.map(
        Option.filter(single(params.connected), (provider) => provider === "strava"),
        (): ReturnBanner => ({ tone: "success", title: "Strava connected" }),
      ),
  )

/** Why the last attempt failed, never the provider's raw text. */
export const FAILURE_COPY: { readonly [R in ExportFailureReason]: string } = {
  unauthorized: "Strava refused the connection",
  rate_limited: "Strava is busy. Retry later",
  rejected: "Strava rejected the activity",
  provider_error: "Strava did not answer",
  transport: "No connection to Strava",
  session_missing: "The session no longer exists",
  app_inactive: BLOCKED_COPY,
  token_rejected: "Garmin rejected the token. Paste a new personal API token.",
}

export type ExportAction =
  | { readonly _tag: "None" }
  | { readonly _tag: "View"; readonly url: string }
  | { readonly _tag: "Retry"; readonly id: ActivityExportId; readonly accessibilityLabel: string }

export interface ExportRowCopy {
  readonly key: string
  readonly icon: IconName
  readonly title: string
  readonly subtitle: string
  readonly pill: PillCopy
  readonly action: ExportAction
}

const failureSubtitle = (row: ActivityExport): string =>
  Option.match(row.lastError, { onNone: () => "Export failed", onSome: (r) => FAILURE_COPY[r] })

const retry = (row: ActivityExport, title: string): ExportAction => ({
  _tag: "Retry",
  id: row.id,
  accessibilityLabel: `Retry export of ${title}`,
})

const failedRow = (row: ActivityExport, title: string) => ({
  icon: "warning" as const,
  subtitle: failureSubtitle(row),
  pill: { label: "Failed", tone: "danger" as const },
  action: retry(row, title),
})

const pendingRow = {
  icon: "clock" as const,
  subtitle: PENDING_SUBTITLE,
  pill: { label: "Pending", tone: "neutral" as const },
  action: { _tag: "None" } as const,
}

/** The session the export is for, as the local store knows it (None when it is not on this device). */
export interface ExportSession {
  readonly title: string
  readonly startedAt: DateTime.Utc
}

/** "26 Oct · Push day"; the export's own date and "Session" when the session is not local. */
export const exportTitle = (
  row: ActivityExport,
  session: Option.Option<ExportSession>,
  zone: DateTime.TimeZone,
): string =>
  Option.match(session, {
    onNone: () => `${formatDay(row.createdAt, zone)} · ${SESSION_FALLBACK}`,
    onSome: ({ title, startedAt }) => `${formatDay(startedAt, zone)} · ${title}`,
  })

/** One Recent exports row: icon, pill, subtitle and what tapping does. */
export const exportRow = (
  row: ActivityExport,
  session: Option.Option<ExportSession>,
  zone: DateTime.TimeZone,
): ExportRowCopy => {
  const title = exportTitle(row, session, zone)
  const byStatus: { readonly [S in ExportStatus]: () => Omit<ExportRowCopy, "key" | "title"> } = {
    pending: () => pendingRow,
    running: () => pendingRow,
    sent: () => ({
      icon: "check",
      pill: { label: "Sent", tone: "success" },
      ...Option.match(row.externalActivityId, {
        onNone: () => ({ subtitle: "Sent", action: { _tag: "None" } as const }),
        onSome: (id) => ({
          subtitle: VIEW_ON_STRAVA,
          action: { _tag: "View", url: `https://www.strava.com/activities/${id}` } as const,
        }),
      }),
    }),
    failed: () => failedRow(row, title),
    dead: () => failedRow(row, title),
    blocked: () => ({
      icon: "warning",
      subtitle: BLOCKED_COPY,
      pill: { label: "Blocked", tone: "danger" },
      action: retry(row, title),
    }),
  }
  return { key: row.id, title, ...byStatus[row.status]() }
}

/** The detail page shows the blocked banner when the status or any row says so. */
export const isBlocked = (
  status: ProviderStatus,
  rows: ReadonlyArray<Pick<ActivityExport, "status">>,
): boolean => status.blockedExports > 0 || rows.some((row) => row.status === "blocked")

/** `IntegrationsRequestFailed` reasons (the service's internal error, mirrored here as copy keys). */
export type FailureReason = "offline" | "server" | "not-connected" | "not-configured"

/** Copy for a failed load or action. */
export const failureTitle = (reason: FailureReason): string =>
  ({
    offline: "Integrations need a connection",
    server: "Integrations could not be loaded",
    "not-connected": "Strava is not connected",
    "not-configured": GO_LIVE_NOTE,
  })[reason]

export const failureBody = (reason: FailureReason): string =>
  ({
    offline: "Connect to the internet and sign in, then try again.",
    server: "The server did not answer. Try again in a moment.",
    "not-connected": "Connect Strava first.",
    "not-configured": "No Strava app is registered yet.",
  })[reason]

/**
 * The banner after a failed action. `not-configured` (no Strava app registered yet) is an info
 * note with the go-live copy, not an error: there is nothing to try again.
 */
export const actionBanner = (
  reason: FailureReason,
): { readonly tone: "info" | "danger"; readonly title: string; readonly body?: string } =>
  reason === "not-configured"
    ? { tone: "info", title: GO_LIVE_NOTE }
    : { tone: "danger", title: failureTitle(reason), body: failureBody(reason) }

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const

/** "Mon 27 Oct" in `zone`. */
export const formatWeekdayDay = (at: DateTime.DateTime, zone: DateTime.TimeZone): string =>
  `${WEEKDAYS[DateTime.toParts(DateTime.setZone(at, zone)).weekDay] ?? ""} ${formatDay(at, zone)}`

/** No-break space: a count and its noun never wrap apart, so a line breaks only at " · ". */
export const NBSP = " "

const countOf = (count: number, one: string, many: string): string =>
  `${count}${NBSP}${count === 1 ? one : many}`

/** Connected body: "Connected as <name> · <n> activities · <n> days" (counts 0 before the first pull). */
export const garminConnectedLine = (status: ProviderStatus): string => {
  const who = Option.match(status.account, {
    onNone: () => "Connected",
    onSome: ({ displayName }) => `Connected as ${displayName}`,
  })
  const activities = status.imports?.activities ?? 0
  const days = status.imports?.days ?? 0
  return `${who} · ${countOf(activities, "activity", "activities")} · ${countOf(days, "day", "days")}`
}

/** "Token added Mon 27 Oct"; None when the server sent no `connectedAt`. */
export const tokenAddedLine = (
  status: ProviderStatus,
  zone: DateTime.TimeZone,
): Option.Option<string> =>
  Option.map(status.connectedAt, (at) => `Token added ${formatWeekdayDay(at, zone)}`)

/** Why the last Garmin action failed: a request failure or the worker's token verdict. */
export type GarminFailure =
  | { readonly _tag: "Failed"; readonly reason: FailureReason }
  | { readonly _tag: "Rejected"; readonly reason: GarminRejectReason }

/**
 * The banner to show after a failed action, if any. A failed connect is hidden once the reloaded
 * status reads connected: the request timed out on the device but the server connected anyway.
 */
export const garminVisibleFailure = (
  action:
    | { readonly _tag: "Idle" }
    | { readonly _tag: "Busy" }
    | (GarminFailure & { readonly action: string }),
  state: ProviderStatus["state"],
): Option.Option<BannerCopy> => {
  if (action._tag === "Idle" || action._tag === "Busy") return Option.none()
  const connectedAnyway = action.action === "connect" && state === "connected"
  return connectedAnyway ? Option.none() : Option.some(garminActionBanner(action))
}

export interface BannerCopy {
  readonly tone: "info" | "danger"
  readonly title: string
  readonly body?: string
}

/**
 * The Garmin card's banner. Token verdicts use §8's copy; offline and server reuse the shared copy;
 * the Strava-worded `not-connected` / `not-configured` lines are replaced by Garmin's own.
 */
export const garminActionBanner = (failure: GarminFailure): BannerCopy =>
  Match.value(failure).pipe(
    Match.tagsExhaustive({
      Rejected: ({ reason }): BannerCopy => ({ tone: "danger", title: GARMIN_REJECT_COPY[reason] }),
      Failed: ({ reason }): BannerCopy =>
        ({
          offline: () => actionBanner("offline"),
          server: () => actionBanner("server"),
          "not-connected": (): BannerCopy => ({ tone: "danger", title: GARMIN.notConnected }),
          "not-configured": (): BannerCopy => ({
            tone: "info",
            title: GARMIN_REJECT_COPY["not-configured"],
          }),
        })[reason](),
    }),
  )
