import {
  ActivityExport,
  ConnectRejected,
  ConnectRequest,
  ConnectResponse,
  ExportsQuery,
  IntegrationNotConnected,
  IntegrationsStatus,
  NativeRateLimited,
  NotFound,
  RetryExportRequest,
  ValidationError,
} from "@tanren/shared"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiError, HttpApiGroup } from "effect/http-api"
import { Authentication } from "./Authentication"

const Internal = HttpApiError.InternalServerError

/** Design §5. The OAuth callback is a plain route (`integrations/callbackRoutes.ts`), not here. */
export class IntegrationsApi extends HttpApiGroup.make("integrations")
  .add(
    HttpApiEndpoint.get("status", "/integrations", {
      success: IntegrationsStatus,
      error: Internal,
    }),
  )
  .add(
    HttpApiEndpoint.post("connect", "/integrations/strava/connect", {
      payload: ConnectRequest,
      success: ConnectResponse,
      error: [ConnectRejected, NativeRateLimited, Internal],
    }),
  )
  .add(
    HttpApiEndpoint.delete("disconnect", "/integrations/strava", {
      error: [IntegrationNotConnected, Internal],
    }),
  )
  .add(
    HttpApiEndpoint.get("exports", "/integrations/strava/exports", {
      query: ExportsQuery,
      success: Schema.Array(ActivityExport),
      error: [ValidationError, Internal],
    }),
  )
  .add(
    HttpApiEndpoint.post("retry", "/integrations/strava/exports/retry", {
      payload: RetryExportRequest,
      success: ActivityExport,
      error: [NotFound, IntegrationNotConnected, Internal],
    }),
  )
  .middleware(Authentication) {}
