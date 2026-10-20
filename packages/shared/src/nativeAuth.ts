import { Schema } from "effect"
import { Email, Timestamp } from "./common"
import { UserId } from "./ids"

/** RFC 7636 code verifier: base64url of 32 random bytes (43 chars). Never leaves the device. */
export const PkceVerifier = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{43}$/)).pipe(
  Schema.brand("PkceVerifier"),
)
export type PkceVerifier = typeof PkceVerifier.Type

/** `b64url(SHA-256(verifier))`, 43 chars; travels in the magic link's callbackURL. */
export const PkceChallenge = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{43}$/)).pipe(
  Schema.brand("PkceChallenge"),
)
export type PkceChallenge = typeof PkceChallenge.Type

/**
 * `<one-time token (32 chars)>.<HMAC binding to the challenge (43 b64url)>`, single use. The token
 * comes from Better Auth's `generateRandomString(32)`, whose alphabet is `a-z 0-9 A-Z - _`
 * (`better-auth/dist/crypto/random.mjs`), so both halves are base64url characters; `.` separates them.
 */
export const NativeCode = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9_-]{32}\.[A-Za-z0-9_-]{43}$/),
).pipe(Schema.brand("NativeCode"))
export type NativeCode = typeof NativeCode.Type

/** The raw Better Auth `session.token`, sent as `Authorization: Bearer`. */
export const SessionToken = Schema.String.check(Schema.isMinLength(1)).pipe(
  Schema.brand("SessionToken"),
)
export type SessionToken = typeof SessionToken.Type

/** `POST /api/native/session` body. */
export const NativeSessionRequest = Schema.Struct({ code: NativeCode, verifier: PkceVerifier })
export type NativeSessionRequest = typeof NativeSessionRequest.Type

/** `POST /api/native/session` 200 body. */
export const NativeSessionResponse = Schema.Struct({
  token: SessionToken,
  userId: UserId,
  expiresAt: Timestamp,
})
export type NativeSessionResponse = typeof NativeSessionResponse.Type

/** Stored on the device between sending the link and the exchange (mobile only, not on the wire). */
export const PendingNativeSignIn = Schema.Struct({ verifier: PkceVerifier, createdAt: Timestamp })
export type PendingNativeSignIn = typeof PendingNativeSignIn.Type

/**
 * `POST /api/native/begin` body. The worker signs `(email, challenge, returnTo, expiry)` into the
 * magic link's callbackURL and sends the link itself, so `/auth/native/complete` only issues a code
 * for a sign-in the app started (session-export CSRF, design §4). `returnTo` must be an allowed
 * `exp(s)://<pinned host>/…/--/auth/callback` or `tanren://auth/callback`.
 */
export const NativeBeginRequest = Schema.Struct({
  email: Email,
  challenge: PkceChallenge,
  returnTo: Schema.String,
})
export type NativeBeginRequest = typeof NativeBeginRequest.Type

/** `POST /api/native/begin` 200 body: the link went out. */
export const NativeBeginResponse = Schema.Struct({ sent: Schema.Literal(true) })
export type NativeBeginResponse = typeof NativeBeginResponse.Type

/** `POST /api/native/begin` 400: undecodable body, or `returnTo` not on the allowlist. */
export class NativeBeginRejected extends Schema.TaggedError<NativeBeginRejected>()(
  "NativeBeginRejected",
  { reason: Schema.Literals(["malformed", "return-to"]) },
  { httpApiStatus: 400 },
) {}

/** 429 from any native sign-in route: too many requests from this IP; retry after the window. */
export class NativeRateLimited extends Schema.TaggedError<NativeRateLimited>()(
  "NativeRateLimited",
  { retryAfterSeconds: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)) },
  { httpApiStatus: 429 },
) {}

/** `POST /api/native/session` 400: undecodable body, binding mismatch, or unknown/used/expired code. */
export class NativeCodeRejected extends Schema.TaggedError<NativeCodeRejected>()(
  "NativeCodeRejected",
  { reason: Schema.Literals(["malformed", "mismatch", "invalid"]) },
  { httpApiStatus: 400 },
) {}
