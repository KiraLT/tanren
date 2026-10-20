import { NativeCode, PkceChallenge, type PkceVerifier } from "@tanren/shared"
import { Effect, Option, Redacted, Schema } from "effect"

/**
 * Where the complete page may send the one-time code: Expo Go (`exp://<host>/--/auth/callback`,
 * `exps://` over EAS Update) or a dev build (`tanren://auth/callback`). Nothing else, so the page
 * is no open redirect.
 */
export const RETURN_TO = /^(?:exps?:\/\/[^\s?#]+\/--\/auth\/callback|tanren:\/\/\/?auth\/callback)$/

export const isAllowedReturnTo = (raw: string): boolean => RETURN_TO.test(raw)

const encoder = new TextEncoder()

/** base64url without padding (RFC 4648 §5). */
const b64url = (bytes: Uint8Array): string =>
  btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")

/** Inverse of `b64url`; None when the input is not base64url. */
const fromB64url = (raw: string): Option.Option<Uint8Array<ArrayBuffer>> =>
  Option.liftThrowable(() =>
    Uint8Array.from(atob(raw.replace(/-/g, "+").replace(/_/g, "/")), (char) => char.charCodeAt(0)),
  )()

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

/** The MAC input: versioned, so a future binding format can never collide with this one. */
const macInput = (ott: string, challenge: string) =>
  encoder.encode(`tanren-native-v1:${ott}.${challenge}`)

/** `ott + "." + b64url(HMAC-SHA256(secret, "tanren-native-v1:" + ott + "." + challenge))`. */
export const signCode = (
  secret: Redacted.Redacted<string>,
  ott: string,
  challenge: PkceChallenge,
): Effect.Effect<NativeCode> =>
  Effect.gen(function* () {
    const key = yield* hmacKey(secret)
    const mac = yield* Effect.promise(() =>
      crypto.subtle.sign("HMAC", key, macInput(ott, challenge)),
    )
    // The OTT is Better Auth's 32-char token and the MAC 43 base64url chars: always a NativeCode.
    return yield* Effect.orDie(
      Schema.decodeUnknownEffect(NativeCode)(`${ott}.${b64url(new Uint8Array(mac))}`),
    )
  })

/**
 * Recomputes the binding from the verifier and checks it in constant time (`subtle.verify`).
 * Some(ott) when the code was issued for this verifier's challenge, None otherwise.
 */
export const verifyCode = (
  secret: Redacted.Redacted<string>,
  code: NativeCode,
  verifier: PkceVerifier,
): Effect.Effect<Option.Option<string>> =>
  Effect.gen(function* () {
    const [ott = "", mac = ""] = code.split(".")
    const macBytes = fromB64url(mac)
    if (Option.isNone(macBytes)) {
      return Option.none()
    }
    const challenge = yield* challengeOf(verifier)
    const key = yield* hmacKey(secret)
    const valid = yield* Effect.promise(() =>
      crypto.subtle.verify("HMAC", key, macBytes.value, macInput(ott, challenge)),
    )
    return valid ? Option.some(ott) : Option.none()
  })
