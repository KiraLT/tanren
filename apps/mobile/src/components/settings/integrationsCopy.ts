import type {
  ActivityExport,
  ActivityExportId,
  ExportFailureReason,
  ExportStatus,
  Provider,
  ProviderStatus,
} from "@tanren/shared"
import { DateTime, Option } from "effect"
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

export const PROVIDER_NAMES: { readonly [P in Provider]: string } = { strava: "Strava" }

export const BLOCKED_COPY = "Strava app inactive — resubscribe on strava.com"
export const IDLE_SUBTITLE = "Exports finished sessions"
export const REVOKED_SUBTITLE = "Strava stopped accepting Tanren. Connect again"
export const DETAIL_BODY =
  "Finished sessions are posted as 'Weight Training' activities. One way; Tanren never reads your Strava data."
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
export const ABOUT_BODY =
  "Integrations send finished sessions to other apps. Tanren only writes; it never reads data back."

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

/** The provider's list row: pill + subtitle. Blocked wins over failed; failed over last export. */
export const providerRow = (status: ProviderStatus, zone: DateTime.TimeZone): ProviderRowCopy => {
  const title = PROVIDER_NAMES[status.provider]
  const { pill, subtitle } = {
    connected: () => connectedRow(status, zone),
    revoked: () => ({
      pill: { label: "Reconnect", tone: "danger" as const },
      subtitle: REVOKED_SUBTITLE,
    }),
    disconnected: () => ({
      pill: { label: "Not connected", tone: "neutral" as const },
      subtitle: IDLE_SUBTITLE,
    }),
  }[status.state]()
  return { title, pill, subtitle, accessibilityLabel: `${title}, ${pill.label}` }
}

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

/** Copy for a failed load or action (`IntegrationsRequestFailed` reasons). */
export const failureTitle = (reason: "offline" | "server" | "not-connected"): string =>
  ({
    offline: "Integrations need a connection",
    server: "Integrations could not be loaded",
    "not-connected": "Strava is not connected",
  })[reason]

export const failureBody = (reason: "offline" | "server" | "not-connected"): string =>
  ({
    offline: "Connect to the internet and sign in, then try again.",
    server: "The server did not answer. Try again in a moment.",
    "not-connected": "Connect Strava first.",
  })[reason]
