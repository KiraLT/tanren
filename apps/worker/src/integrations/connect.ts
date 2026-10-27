import { ConnectRejected, type ConnectResponse, UserId } from "@tanren/shared"
import { Clock, Data, Effect, Option, Result, Schema } from "effect"
import { Base64Url } from "effect/encoding"
import { deriveSubKey } from "../auth/Tokens"
import type { WorkerConfigShape } from "../Config"
import { isAllowedIntegrationReturnTo } from "./returnTo"

export const STRAVA_AUTHORIZE_URL = "https://www.strava.com/oauth/authorize"
export const STRAVA_CALLBACK_PATH = "/integrations/strava/callback"
/** A connect link is good for 10 minutes (design §4). */
export const STATE_TTL_MS = 10 * 60 * 1000
/** Strava documents no limit; we keep the whole `state` well under 600 chars (design §4). */
export const MAX_STATE_LENGTH = 600

/**
 * SEC-1 B1 (forced connect): the web flow's double-submit cookie. Set on the
 * `POST /integrations/strava/connect` response (host-only, `Secure`, `HttpOnly`, `SameSite=Lax`, so
 * Strava's top-level redirect back carries it), required by the callback to equal the state's
 * `binding`. An attacker's authorize link finished in the victim's browser has no matching cookie.
 */
export const CONNECT_COOKIE = "__Host-tanren-connect"
export const CONNECT_COOKIE_MAX_AGE_SECONDS = STATE_TTL_MS / 1000

/** What the signed `state` carries. `expiresAt` is epoch milliseconds; `binding` = web flow only. */
export const ConnectState = Schema.Struct({
  userId: UserId,
  returnTo: Schema.String,
  expiresAt: Schema.Number.check(Schema.isInt()),
  binding: Schema.optionalKey(Schema.String),
})
export type ConnectState = typeof ConnectState.Type

/** Internal: why a callback `state` was refused. Never carries the state itself. */
export class StateRejected extends Data.TaggedError("StateRejected")<{
  readonly reason: "malformed" | "signature" | "expired" | "return-to" | "binding"
}> {}

/** 16 random bytes, base64url (22 chars): the cookie value and the state's `binding`. */
export const newBinding: Effect.Effect<string> = Effect.sync(() =>
  Base64Url.encode(crypto.getRandomValues(new Uint8Array(16))),
)

/**
 * The callback's binding check: a state minted for a web `returnTo` must carry a `binding` equal to
 * the cookie. A native state (no cookie jar) carries none and passes; `isNative` is decided by the
 * signed `returnTo`, so a web return cannot be downgraded to the unbound path.
 */
export const checkBinding = (
  state: ConnectState,
  cookie: Option.Option<string>,
  isNative: boolean,
): Effect.Effect<void, StateRejected> => {
  if (isNative && state.binding === undefined) {
    return Effect.void
  }
  const matches =
    state.binding !== undefined &&
    Option.match(cookie, { onNone: () => false, onSome: (value) => value === state.binding })
  return matches ? Effect.void : Effect.fail(new StateRejected({ reason: "binding" }))
}

type StateConfig = Pick<
  WorkerConfigShape,
  "integrationTokenKey" | "allowedOrigins" | "nativeReturnPrefixes"
>

/**
 * HKDF `info` of the state HMAC key: its own sub-key of `INTEGRATION_TOKEN_KEY`, never the AES key
 * `TokenSeal` uses (security review B3).
 */
export const STATE_KEY_INFO = "tanren-state-v2"

const encoder = new TextEncoder()

const stateKey = (config: StateConfig) =>
  Effect.gen(function* () {
    const sub = yield* deriveSubKey(config.integrationTokenKey, STATE_KEY_INFO)
    return yield* Effect.promise(() =>
      crypto.subtle.importKey("raw", sub.bytes, { name: "HMAC", hash: "SHA-256" }, false, [
        "sign",
        "verify",
      ]),
    )
  })

const encodeState = Schema.encodeSync(Schema.fromJsonString(ConnectState))
const decodeState = Schema.decodeUnknownOption(Schema.fromJsonString(ConnectState))

/** `base64url(JSON {userId, returnTo, expiresAt}) + "." + b64url(HMAC-SHA256(stateKey, …))`. */
export const signState = (config: StateConfig, state: ConnectState): Effect.Effect<string> =>
  Effect.gen(function* () {
    const payload = Base64Url.encode(encodeState(state))
    const key = yield* stateKey(config)
    const signature = yield* Effect.promise(() =>
      crypto.subtle.sign("HMAC", key, encoder.encode(payload)),
    )
    return `${payload}.${Base64Url.encode(new Uint8Array(signature))}`
  })

/** Constant-time check of `signature` against `payload` (`subtle.verify`). */
const signatureMatches = (config: StateConfig, payload: string, signature: string) =>
  Result.match(Base64Url.decode(signature), {
    onFailure: () => Effect.succeed(false),
    onSuccess: (bytes) =>
      Effect.flatMap(stateKey(config), (key) =>
        Effect.promise(() =>
          crypto.subtle.verify("HMAC", key, new Uint8Array(bytes), encoder.encode(payload)),
        ),
      ),
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
    if (!(yield* signatureMatches(config, payload, signature))) {
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

/**
 * `POST /integrations/strava/connect`: allow-list `returnTo`, sign a 10-minute state, build the URL.
 * `binding` (web flow): bound into the state; the handler sets it as `CONNECT_COOKIE`.
 */
export const startConnect = (
  config: ConnectConfig,
  userId: UserId,
  returnTo: string,
  binding: Option.Option<string> = Option.none(),
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
    const state = yield* signState(config, {
      userId,
      returnTo,
      expiresAt: now + STATE_TTL_MS,
      ...Option.match(binding, { onNone: () => ({}), onSome: (value) => ({ binding: value }) }),
    })
    return { url: authorizeUrl(config, state) }
  })
