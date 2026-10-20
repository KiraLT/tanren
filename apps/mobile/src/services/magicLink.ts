import { Data, Effect, Match, Option } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http"
import { apiBaseUrl } from "./apiBaseUrl"

/** Better Auth magic-link endpoint (relative to `apiBaseUrl`). */
export const MAGIC_LINK_PATH = "/api/auth/sign-in/magic-link"

/**
 * Internal: the magic-link request did not go through. `invalid-email` = refused before sending;
 * `unreachable` = no network / server down; `rejected` = non-2xx (e.g. 403 origin not trusted).
 */
export class MagicLinkFailed extends Data.TaggedError("MagicLinkFailed")<{
  readonly reason: "invalid-email" | "unreachable" | "rejected"
  readonly status: Option.Option<number>
}> {}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** The trimmed address, or `None` when it does not look like an email. */
export const normalizeEmail = (raw: string): Option.Option<string> =>
  Option.some(raw.trim()).pipe(Option.filter((value) => EMAIL_SHAPE.test(value)))

/**
 * Sign-in works on web (cookie) and on iOS / Android (one-time code deep link + Bearer token,
 * `NativeSession`). `platform` is `process.env.EXPO_OS`; anything else (tests, unknown) is off.
 */
export const signInSupported = (platform: string): boolean =>
  platform === "web" || platform === "ios" || platform === "android"

/** Shown instead of the sign-in entry point where `signInSupported` is false (screens still import it). */
export const SIGN_IN_WEB_ONLY_NOTICE = "Sign in on the web app for now"

/** Absolute URL of `/today` that the magic link lands on after verifying (web only). */
export const todayCallbackUrl = (origin: string): string => `${origin.replace(/\/+$/, "")}/today`

/**
 * Relative callbackURL for a native sign-in: after verifying, the link lands on the worker's
 * `/auth/native/complete` page, which hands `returnTo` (the app's deep link) a one-time code bound
 * to `challenge`. Relative, so it resolves on the API origin, which is always trusted.
 */
export const nativeCallbackUrl = (challenge: string, returnTo: string): string =>
  `/auth/native/complete?${new URLSearchParams({ challenge, returnTo }).toString()}`

/** JSON body of `POST /api/auth/sign-in/magic-link`. */
export const magicLinkBody = (email: string, callbackURL: string) => ({ email, callbackURL })

/** A short, user-facing explanation (no status codes beyond the one that helps). */
export const magicLinkFailureMessage = (error: MagicLinkFailed): string =>
  Match.value(error.reason).pipe(
    Match.when("invalid-email", () => "Enter a valid email address."),
    Match.when(
      "unreachable",
      () => "Could not reach the server. Check your connection and try again.",
    ),
    Match.when(
      "rejected",
      () =>
        `The server refused the request${Option.match(error.status, {
          onNone: () => "",
          onSome: (status) => ` (${status})`,
        })}. Try again.`,
    ),
    Match.exhaustive,
  )

/**
 * Asks the worker to email a magic link that returns to `callbackURL`. Sends the session cookie
 * (`credentials: "include"`) and no trace headers (they would fail the CORS preflight), as in
 * `SyncTransport`. Provides its own HttpClient.
 */
export const sendMagicLink = (
  rawEmail: string,
  callbackURL: string,
): Effect.Effect<void, MagicLinkFailed> =>
  Option.match(normalizeEmail(rawEmail), {
    onNone: () =>
      Effect.fail(new MagicLinkFailed({ reason: "invalid-email", status: Option.none() })),
    onSome: (email) =>
      Effect.gen(function* () {
        const baseUrl = yield* apiBaseUrl
        const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk)
        const request = yield* HttpClientRequest.post(`${baseUrl}${MAGIC_LINK_PATH}`).pipe(
          HttpClientRequest.acceptJson,
          HttpClientRequest.bodyJson(magicLinkBody(email, callbackURL)),
        )
        yield* client
          .execute(request)
          .pipe(
            Effect.provideService(FetchHttpClient.RequestInit, { credentials: "include" }),
            Effect.provideService(HttpClient.TracerPropagationEnabled, false),
          )
      }).pipe(
        Effect.asVoid,
        Effect.mapError(
          (cause) =>
            new MagicLinkFailed({
              reason:
                "reason" in cause && cause.reason._tag === "StatusCodeError"
                  ? "rejected"
                  : "unreachable",
              status:
                "reason" in cause && cause.reason._tag === "StatusCodeError"
                  ? Option.some(cause.reason.response.status)
                  : Option.none(),
            }),
        ),
        Effect.provide(FetchHttpClient.layer),
      ),
  })
