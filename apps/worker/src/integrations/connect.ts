import { ConnectRejected, type ConnectResponse, UserId } from "@tanren/shared"
import { Clock, Data, Effect, Option, Result, Schema } from "effect"
import { Base64Url } from "effect/encoding"
import { mac, macMatches } from "../auth/nativeCode"
import type { WorkerConfigShape } from "../Config"
import { isAllowedIntegrationReturnTo } from "./returnTo"

export const STRAVA_AUTHORIZE_URL = "https://www.strava.com/oauth/authorize"
export const STRAVA_CALLBACK_PATH = "/integrations/strava/callback"
/** A connect link is good for 10 minutes (design §4). */
export const STATE_TTL_MS = 10 * 60 * 1000
/** Strava documents no limit; we keep the whole `state` well under 600 chars (design §4). */
export const MAX_STATE_LENGTH = 600

/** What the signed `state` carries. `expiresAt` is epoch milliseconds. */
export const ConnectState = Schema.Struct({
  userId: UserId,
  returnTo: Schema.String,
  expiresAt: Schema.Number.check(Schema.isInt()),
})
export type ConnectState = typeof ConnectState.Type

/** Internal: why a callback `state` was refused. Never carries the state itself. */
export class StateRejected extends Data.TaggedError("StateRejected")<{
  readonly reason: "malformed" | "signature" | "expired" | "return-to"
}> {}

type StateConfig = Pick<
  WorkerConfigShape,
  "integrationTokenKey" | "allowedOrigins" | "nativeReturnPrefixes"
>

/** Versioned MAC input: no other signature in the worker can collide with a connect state. */
const macInput = (payload: string) => `tanren-strava-state-v1:${payload}`

const encodeState = Schema.encodeSync(Schema.fromJsonString(ConnectState))
const decodeState = Schema.decodeUnknownOption(Schema.fromJsonString(ConnectState))

/** `base64url(JSON {userId, returnTo, expiresAt}) + "." + b64url(HMAC-SHA256(key, …))`. */
export const signState = (config: StateConfig, state: ConnectState): Effect.Effect<string> =>
  Effect.gen(function* () {
    const payload = Base64Url.encode(encodeState(state))
    const signature = yield* mac(config.integrationTokenKey, macInput(payload))
    return `${payload}.${signature}`
  })

/** Signature first (constant time), then expiry, then the `returnTo` allow-list again. */
export const verifyState = (
  config: StateConfig,
  raw: string,
): Effect.Effect<ConnectState, StateRejected> =>
  Effect.gen(function* () {
    const parts = raw.split(".")
    const [payload = "", signature = ""] = parts
    if (parts.length !== 2 || payload.length === 0 || signature.length === 0) {
      return yield* new StateRejected({ reason: "malformed" })
    }
    if (!(yield* macMatches(config.integrationTokenKey, macInput(payload), signature))) {
      return yield* new StateRejected({ reason: "signature" })
    }
    const json = Result.match(Base64Url.decode(payload), {
      onFailure: () => Option.none<string>(),
      onSuccess: (bytes) =>
        Option.liftThrowable(() => new TextDecoder("utf-8", { fatal: true }).decode(bytes))(),
    })
    const state = Option.flatMap(json, decodeState)
    if (Option.isNone(state)) {
      return yield* new StateRejected({ reason: "malformed" })
    }
    const now = yield* Clock.currentTimeMillis
    if (now > state.value.expiresAt) {
      return yield* new StateRejected({ reason: "expired" })
    }
    if (!isAllowedIntegrationReturnTo(state.value.returnTo, config)) {
      return yield* new StateRejected({ reason: "return-to" })
    }
    return state.value
  })

type ConnectConfig = StateConfig &
  Pick<
    WorkerConfigShape,
    "environment" | "betterAuthUrl" | "stravaMode" | "stravaClientId" | "stravaClientSecret"
  >

/** Console mode writes a fake integration: only allowed when `environment` is `local`. */
export const isConsoleOutsideLocal = (
  config: Pick<WorkerConfigShape, "environment" | "stravaMode">,
): boolean => config.stravaMode === "console" && config.environment !== "local"

/**
 * The URL the app opens. Provider mode: Strava's authorize page; console mode (local): our own
 * callback with `code=console`, so the browser walks the real callback without Strava.
 */
export const authorizeUrl = (config: ConnectConfig, state: string): string => {
  const redirectUri = `${config.betterAuthUrl}${STRAVA_CALLBACK_PATH}`
  return config.stravaMode === "console"
    ? `${redirectUri}?${new URLSearchParams({ state, code: "console", scope: "read,activity:write" })}`
    : `${STRAVA_AUTHORIZE_URL}?${new URLSearchParams({
        client_id: config.stravaClientId,
        redirect_uri: redirectUri,
        response_type: "code",
        // Always show Strava's consent screen: with `auto` a returning athlete is redirected at once,
        // so an attacker could have the owner open the attacker's connect link and receive the
        // owner's write token on the attacker's Tanren account (REV-2).
        approval_prompt: "force",
        scope: "activity:write",
        state,
      })}`
}

/** `POST /integrations/strava/connect`: allow-list `returnTo`, sign a 10-minute state, build the URL. */
export const startConnect = (
  config: ConnectConfig,
  userId: UserId,
  returnTo: string,
): Effect.Effect<ConnectResponse, ConnectRejected> =>
  Effect.gen(function* () {
    if (!isAllowedIntegrationReturnTo(returnTo, config)) {
      return yield* new ConnectRejected({ reason: "return-to" })
    }
    if (
      isConsoleOutsideLocal(config) ||
      (config.stravaMode === "provider" && Option.isNone(config.stravaClientSecret))
    ) {
      return yield* new ConnectRejected({ reason: "not-configured" })
    }
    const now = yield* Clock.currentTimeMillis
    const state = yield* signState(config, { userId, returnTo, expiresAt: now + STATE_TTL_MS })
    return { url: authorizeUrl(config, state) }
  })
