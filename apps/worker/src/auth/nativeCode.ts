import { NativeBeginRequest, NativeCode, PkceChallenge, type PkceVerifier } from "@tanren/shared"
import { Effect, Option, Redacted, Schema } from "effect"

/**
 * Where the complete page may send the one-time code: Expo Go (`exp://<host>[:port][/…]/--/auth/callback`,
 * `exps://` over EAS Update) on a pinned prefix, or a dev build (`tanren://auth/callback`). Host is
 * letters, digits, `.` and `-`; the port is digits only; path segments are `[A-Za-z0-9_-]+`, so no
 * dot segments, percent-escapes, userinfo, query or fragment.
 */
export const RETURN_TO =
  /^(?:exps?:\/\/[A-Za-z0-9.-]+(?::\d+)?(?:\/[A-Za-z0-9_-]+)*\/--\/auth\/callback|tanren:\/\/\/?auth\/callback)$/

/** `raw` is already in WHATWG-serialised form, so no parser can read it differently from `startsWith`. */
const isCanonicalUrl = (raw: string): boolean =>
  Option.match(Option.liftThrowable(() => new URL(raw).href)(), {
    onNone: () => false,
    onSome: (href) => href === raw,
  })

/**
 * `returnTo` has the `RETURN_TO` shape AND starts with one of `prefixes`
 * (`WorkerConfig.nativeReturnPrefixes`: `exp://192.168.1.5:`, `exps://u.expo.dev/<projectId>/`,
 * `tanren://` only when listed). A host alone is not enough: every EAS project shares `u.expo.dev`,
 * so production pins the project path, and a code can only reach an Expo Go loading this project.
 */
export const isAllowedReturnTo =
  (prefixes: ReadonlyArray<string>) =>
  (raw: string): boolean =>
    RETURN_TO.test(raw) &&
    isCanonicalUrl(raw) &&
    prefixes.some((prefix) => prefix.length > 0 && raw.startsWith(prefix))

const encoder = new TextEncoder()

/** base64url without padding (RFC 4648 §5). */
const b64url = (bytes: Uint8Array): string =>
  btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")

/** Inverse of `b64url`; None when the input is not base64url. */
const fromB64url = (raw: string): Option.Option<Uint8Array<ArrayBuffer>> =>
  /^[A-Za-z0-9_-]+$/.test(raw)
    ? Option.liftThrowable(() =>
        Uint8Array.from(atob(raw.replace(/-/g, "+").replace(/_/g, "/")), (char) =>
          char.charCodeAt(0),
        ),
      )()
    : Option.none()

/** `b64url(SHA-256(ascii(verifier)))`, RFC 7636 §4.2 (S256). */
export const challengeOf = (verifier: PkceVerifier): Effect.Effect<PkceChallenge> =>
  Effect.promise(() => crypto.subtle.digest("SHA-256", encoder.encode(verifier))).pipe(
    Effect.map((digest) => b64url(new Uint8Array(digest))),
    // 32 bytes always encode to 43 base64url chars: a failure here is a bug, not an input error.
    Effect.flatMap((raw) => Effect.orDie(Schema.decodeUnknownEffect(PkceChallenge)(raw))),
  )

const hmacKey = (secret: Redacted.Redacted<string>) =>
  Effect.promise(() =>
    crypto.subtle.importKey(
      "raw",
      encoder.encode(Redacted.value(secret)),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    ),
  )

/** `b64url(HMAC-SHA256(secret, input))`, 43 chars. Signs the native sign-in code. */
export const mac = (secret: Redacted.Redacted<string>, input: string) =>
  Effect.gen(function* () {
    const key = yield* hmacKey(secret)
    const signature = yield* Effect.promise(() =>
      crypto.subtle.sign("HMAC", key, encoder.encode(input)),
    )
    return b64url(new Uint8Array(signature))
  })

/** Constant-time check of `macText` against `input` (`subtle.verify`). */
export const macMatches = (secret: Redacted.Redacted<string>, input: string, macText: string) =>
  Effect.gen(function* () {
    const bytes = fromB64url(macText)
    if (Option.isNone(bytes)) {
      return false
    }
    const key = yield* hmacKey(secret)
    return yield* Effect.promise(() =>
      crypto.subtle.verify("HMAC", key, bytes.value, encoder.encode(input)),
    )
  })

/** The code MAC input: versioned, so a future binding format can never collide with this one. */
const codeInput = (ott: string, challenge: string) => `tanren-native-v1:${ott}.${challenge}`

/** `ott + "." + b64url(HMAC-SHA256(secret, "tanren-native-v1:" + ott + "." + challenge))`. */
export const signCode = (
  secret: Redacted.Redacted<string>,
  ott: string,
  challenge: PkceChallenge,
): Effect.Effect<NativeCode> =>
  mac(secret, codeInput(ott, challenge)).pipe(
    // The OTT is Better Auth's 32-char token and the MAC 43 base64url chars: always a NativeCode.
    Effect.flatMap((signature) =>
      Effect.orDie(Schema.decodeUnknownEffect(NativeCode)(`${ott}.${signature}`)),
    ),
  )

/**
 * Recomputes the binding from the verifier and checks it in constant time.
 * Some(ott) when the code was issued for this verifier's challenge, None otherwise.
 */
export const verifyCode = (
  secret: Redacted.Redacted<string>,
  code: NativeCode,
  verifier: PkceVerifier,
): Effect.Effect<Option.Option<string>> =>
  Effect.gen(function* () {
    const [ott = "", signature = ""] = code.split(".")
    const challenge = yield* challengeOf(verifier)
    const valid = yield* macMatches(secret, codeInput(ott, challenge), signature)
    return valid ? Option.some(ott) : Option.none()
  })

/**
 * What `POST /api/native/begin` signs into the magic link's callbackURL: the request plus
 * `expiresAt`, unix seconds after which `/auth/native/complete` refuses the state.
 */
export const BeginState = Schema.Struct({
  ...NativeBeginRequest.fields,
  expiresAt: Schema.Number.check(Schema.isInt()),
})
export type BeginState = typeof BeginState.Type

const beginInput = (state: BeginState) =>
  [
    "tanren-native-begin-v1",
    state.email.toLowerCase(),
    state.challenge,
    state.returnTo,
    String(state.expiresAt),
  ].join("\n")

/** HMAC over (email, challenge, returnTo, expiry): only the worker can start a native sign-in. */
export const signBegin = (secret: Redacted.Redacted<string>, state: BeginState) =>
  mac(secret, beginInput(state))

/** Constant-time check of a begin signature; `email` is the signed-in session's email. */
export const verifyBegin = (
  secret: Redacted.Redacted<string>,
  state: BeginState,
  signature: string,
): Effect.Effect<boolean> => macMatches(secret, beginInput(state), signature)
