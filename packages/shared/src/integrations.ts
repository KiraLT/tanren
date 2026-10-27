import { Schema } from "effect"
import { Label, PageLimit, Timestamp } from "./common"
import { ActivityExportId, SessionId } from "./ids"

/** Outbound activity providers. Grows per ADR; Apple Health is an app-side row, not a `Provider`. */
export const Provider = Schema.Literals(["strava"])
export type Provider = typeof Provider.Type

/** `revoked` = the provider rejected the tokens; the user must reconnect. */
export const IntegrationState = Schema.Literals(["connected", "revoked", "disconnected"])
export type IntegrationState = typeof IntegrationState.Type

/** `blocked` = the provider app is inactive (subscription lapsed); retried slowly, never `dead`. */
export const ExportStatus = Schema.Literals([
  "pending",
  "running",
  "sent",
  "failed",
  "dead",
  "blocked",
])
export type ExportStatus = typeof ExportStatus.Type

/** Why the last attempt failed; never the provider's raw text. */
export const ExportFailureReason = Schema.Literals([
  "unauthorized",
  "rate_limited",
  "rejected",
  "provider_error",
  "transport",
  "session_missing",
  "app_inactive",
])
export type ExportFailureReason = typeof ExportFailureReason.Type

const Count = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))

/** The athlete's first and last name, shown only to the owner of the account. */
export const ProviderAccount = Schema.Struct({ displayName: Label })
export type ProviderAccount = typeof ProviderAccount.Type

export const ProviderStatus = Schema.Struct({
  provider: Provider,
  state: IntegrationState,
  account: Schema.OptionFromNullOr(ProviderAccount),
  connectedAt: Schema.OptionFromNullOr(Timestamp),
  /** The newest `sent` row's `updatedAt`. */
  lastExportAt: Schema.OptionFromNullOr(Timestamp),
  pendingExports: Count,
  /** `failed` plus `dead`; excludes `blocked`. */
  failedExports: Count,
  /** Rows with status `blocked` (the provider app is inactive). */
  blockedExports: Count,
})
export type ProviderStatus = typeof ProviderStatus.Type

export const IntegrationsStatus = Schema.Struct({ providers: Schema.Array(ProviderStatus) })
export type IntegrationsStatus = typeof IntegrationsStatus.Type

export const ActivityExport = Schema.Struct({
  id: ActivityExportId,
  provider: Provider,
  sessionId: SessionId,
  status: ExportStatus,
  attempts: Count,
  /** Opaque provider id; drives the "View on Strava" link. */
  externalActivityId: Schema.OptionFromNullOr(Schema.String),
  lastError: Schema.OptionFromNullOr(ExportFailureReason),
  createdAt: Timestamp,
  updatedAt: Timestamp,
})
export type ActivityExport = typeof ActivityExport.Type

/** `returnTo`: absolute URL, no query, no fragment; the allow-list is checked by the worker. */
export const ConnectRequest = Schema.Struct({
  returnTo: Schema.String.check(Schema.isMaxLength(512)),
})
export type ConnectRequest = typeof ConnectRequest.Type

export const ConnectResponse = Schema.Struct({ url: Schema.String })
export type ConnectResponse = typeof ConnectResponse.Type

export const RetryExportRequest = Schema.Struct({ id: ActivityExportId })
export type RetryExportRequest = typeof RetryExportRequest.Type

/** The page size `GET /integrations/strava/exports` uses when the query has no `limit`. */
export const DEFAULT_EXPORTS_LIMIT = 20

/**
 * Query-string fields for `GET /integrations/strava/exports`. `limit` is optional with no decoding
 * default (the wire shape stays `{ limit? }`); the handler applies `DEFAULT_EXPORTS_LIMIT`.
 */
export const ExportsQuery = { limit: Schema.optionalKey(PageLimit) }

/** The provider has no active integration for this user. */
export class IntegrationNotConnected extends Schema.TaggedError<IntegrationNotConnected>()(
  "IntegrationNotConnected",
  { provider: Provider },
  { httpApiStatus: 409 },
) {}

/** `connect` refused: `returnTo` is not allow-listed, or the provider is not configured. */
export class ConnectRejected extends Schema.TaggedError<ConnectRejected>()(
  "ConnectRejected",
  { reason: Schema.Literals(["return-to", "not-configured"]) },
  { httpApiStatus: 400 },
) {}
