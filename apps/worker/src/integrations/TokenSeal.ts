import { Context, Data, Effect, Layer, Redacted, Result, Schema } from "effect"
import { Base64, Base64Url } from "effect/encoding"
import { WorkerConfig } from "../Config"

/** `v1.<iv b64url>.<ciphertext b64url>`: an AES-256-GCM sealed integration token (design §3). */
export const SealedToken = Schema.String.pipe(Schema.brand("SealedToken"))
export type SealedToken = typeof SealedToken.Type

/**
 * Why `open` refused. Internal: never put it on the wire, never add the sealed or plain value to it.
 * `malformed`: not `v1.<iv>.<ciphertext>`; `authentication`: wrong key or tampered data.
 */
export class TokenSealError extends Data.TaggedError("TokenSealError")<{
  readonly reason: "malformed" | "authentication"
}> {}

export interface TokenSealShape {
  readonly seal: (plain: Redacted.Redacted<string>) => Effect.Effect<SealedToken>
  readonly open: (sealed: SealedToken) => Effect.Effect<Redacted.Redacted<string>, TokenSealError>
}

const VERSION = "v1"
const IV_BYTES = 12
const algorithm = (iv: Uint8Array<ArrayBuffer>): AesGcmParams => ({ name: "AES-GCM", iv })

/**
 * The seal for one key (base64 of 32 bytes, validated at startup by `WorkerConfig`). The
 * `CryptoKey` is imported on first use and memoised, so building the layer does no work at isolate
 * start. A bad key is a defect: `WorkerConfig` already refused it.
 */
export const makeTokenSeal = (key: Redacted.Redacted<string>): Effect.Effect<TokenSealShape> =>
  Effect.gen(function* () {
    const importKey = Effect.gen(function* () {
      const bytes = yield* Result.match(Base64.decode(Redacted.value(key)), {
        onFailure: () => Effect.die("INTEGRATION_TOKEN_KEY is not base64"),
        onSuccess: Effect.succeed,
      })
      return yield* Effect.promise(() =>
        crypto.subtle.importKey("raw", new Uint8Array(bytes), { name: "AES-GCM" }, false, [
          "encrypt",
          "decrypt",
        ]),
      )
    })
    const cryptoKey = yield* Effect.cached(importKey)

    const seal = Effect.fn("TokenSeal.seal")(function* (plain: Redacted.Redacted<string>) {
      const k = yield* cryptoKey
      const iv = yield* Effect.sync(() => crypto.getRandomValues(new Uint8Array(IV_BYTES)))
      const ciphertext = yield* Effect.promise(() =>
        crypto.subtle.encrypt(algorithm(iv), k, new TextEncoder().encode(Redacted.value(plain))),
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

    const open = Effect.fn("TokenSeal.open")(function* (sealed: SealedToken) {
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
          crypto.subtle.decrypt(algorithm(new Uint8Array(iv)), k, new Uint8Array(ciphertext)),
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
