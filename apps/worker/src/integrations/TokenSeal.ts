import type { Provider, UserId } from "@tanren/shared"
import { Context, Data, Effect, Layer, Redacted, Result, Schema } from "effect"
import { Base64Url } from "effect/encoding"
import { deriveSubKey } from "../auth/Tokens"
import { WorkerConfig } from "../Config"

/** `v1.<iv b64url>.<ciphertext b64url>`: an AES-256-GCM sealed integration token (design §3). */
export const SealedToken = Schema.String.pipe(Schema.brand("SealedToken"))
export type SealedToken = typeof SealedToken.Type

/**
 * Why `open` refused. Internal: never put it on the wire, never add the sealed or plain value to it.
 * `malformed`: not `v1.<iv>.<ciphertext>`; `authentication`: wrong key, tampered data, or a value
 * sealed for another user, provider or slot.
 */
export class TokenSealError extends Data.TaggedError("TokenSealError")<{
  readonly reason: "malformed" | "authentication"
}> {}

/**
 * Which row column a sealed value belongs to; it is the AES-GCM additional data, so a value copied
 * into another user's, provider's or slot's column no longer opens (security review B2).
 */
export interface SealBinding {
  readonly userId: UserId
  readonly provider: Provider
  readonly slot: "access" | "refresh"
}

export interface TokenSealShape {
  readonly seal: (
    plain: Redacted.Redacted<string>,
    binding: SealBinding,
  ) => Effect.Effect<SealedToken>
  readonly open: (
    sealed: SealedToken,
    binding: SealBinding,
  ) => Effect.Effect<Redacted.Redacted<string>, TokenSealError>
}

/** HKDF `info` of the AES key; the connect `state` HMAC uses its own sub-key (B3, `connect.ts`). */
export const SEAL_KEY_INFO = "tanren-seal-v2"

const VERSION = "v1"
const IV_BYTES = 12
const encoder = new TextEncoder()
const algorithm = (iv: Uint8Array<ArrayBuffer>, binding: SealBinding): AesGcmParams => ({
  name: "AES-GCM",
  iv,
  additionalData: encoder.encode(`${binding.userId}:${binding.provider}:${binding.slot}`),
})

/**
 * The seal for one `INTEGRATION_TOKEN_KEY` (validated at startup by `WorkerConfig`). The AES key is
 * its HKDF-SHA256 sub-key `SEAL_KEY_INFO`, derived and imported on first use and memoised, so
 * building the layer does no work at isolate start.
 */
export const makeTokenSeal = (key: Redacted.Redacted<string>): Effect.Effect<TokenSealShape> =>
  Effect.gen(function* () {
    const importKey = Effect.gen(function* () {
      const sub = yield* deriveSubKey(key, SEAL_KEY_INFO)
      return yield* Effect.promise(() =>
        crypto.subtle.importKey("raw", sub.bytes, { name: "AES-GCM" }, false, [
          "encrypt",
          "decrypt",
        ]),
      )
    })
    const cryptoKey = yield* Effect.cached(importKey)

    const seal = Effect.fn("TokenSeal.seal")(function* (
      plain: Redacted.Redacted<string>,
      binding: SealBinding,
    ) {
      const k = yield* cryptoKey
      const iv = yield* Effect.sync(() => crypto.getRandomValues(new Uint8Array(IV_BYTES)))
      const ciphertext = yield* Effect.promise(() =>
        crypto.subtle.encrypt(algorithm(iv, binding), k, encoder.encode(Redacted.value(plain))),
      )
      return SealedToken.make(
        `${VERSION}.${Base64Url.encode(iv)}.${Base64Url.encode(new Uint8Array(ciphertext))}`,
      )
    })

    const decodePart = (part: string | undefined) =>
      Result.match(Base64Url.decode(part ?? ""), {
        onFailure: () => Effect.fail(new TokenSealError({ reason: "malformed" })),
        onSuccess: Effect.succeed,
      })

    const open = Effect.fn("TokenSeal.open")(function* (sealed: SealedToken, binding: SealBinding) {
      const [version, ivPart, ciphertextPart, ...rest] = sealed.split(".")
      if (version !== VERSION || rest.length > 0) {
        return yield* new TokenSealError({ reason: "malformed" })
      }
      const iv = yield* decodePart(ivPart)
      const ciphertext = yield* decodePart(ciphertextPart)
      if (iv.length !== IV_BYTES || ciphertext.length === 0) {
        return yield* new TokenSealError({ reason: "malformed" })
      }
      const k = yield* cryptoKey
      const plain = yield* Effect.tryPromise({
        try: () =>
          crypto.subtle.decrypt(
            algorithm(new Uint8Array(iv), binding),
            k,
            new Uint8Array(ciphertext),
          ),
        catch: () => new TokenSealError({ reason: "authentication" }),
      })
      return Redacted.make(new TextDecoder().decode(plain))
    })

    return { seal, open }
  })

export class TokenSeal extends Context.Service<TokenSeal, TokenSealShape>()(
  "@tanren/worker/TokenSeal",
) {
  /** The seal for `config.integrationTokenKey`. */
  static readonly layer = Layer.effect(
    this,
    Effect.flatMap(WorkerConfig, (config) => makeTokenSeal(config.integrationTokenKey)),
  )
  /** For tests and tools that hold a key without a full `WorkerConfig`. */
  static readonly layerWithKey = (key: Redacted.Redacted<string>) =>
    Layer.effect(this, makeTokenSeal(key))
}
