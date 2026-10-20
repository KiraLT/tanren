import {
  NativeBeginRequest,
  NativeBeginResponse,
  NativeCode,
  NativeSessionRequest,
  NativeSessionResponse,
  PendingNativeSignIn,
  PkceChallenge,
  PkceVerifier,
  type SessionToken,
  type UserId,
} from "@tanren/shared"
import {
  Array as Arr,
  Context,
  Data,
  DateTime,
  Effect,
  Layer,
  Match,
  Option,
  Ref,
  Schema,
} from "effect"
import {
  FetchHttpClient,
  HttpClient,
  type HttpClientError,
  HttpClientRequest,
  HttpClientResponse,
} from "effect/http"
import { apiBaseUrl } from "./apiBaseUrl"
import { MagicLinkFailed, normalizeEmail } from "./magicLink"

/**
 * Internal: a native sign-in step failed. `no-pending` = no verifier stored (or older than 15 min)
 * or sign-in is unavailable here; `rejected` = the worker (or a local check) refused the code;
 * `unreachable` = no network / 5xx; `storage` = SecureStore failed; `link-invalid` = the link
 * page reported an expired or used link (`?error=`).
 */
export class NativeSignInFailed extends Data.TaggedError("NativeSignInFailed")<{
  readonly reason: "no-pending" | "rejected" | "unreachable" | "storage" | "link-invalid"
}> {}

export interface NativeSessionShape {
  /** Bearer token, if stored and not past `expiresAt`. Always None on web. */
  readonly token: Effect.Effect<Option.Option<SessionToken>>
  /**
   * Step 1: new verifier, stores the pending sign-in, then `POST /api/native/begin` (the worker
   * signs the callbackURL and emails the link). Fails like the web request (`MagicLinkFailed`).
   */
  readonly begin: (email: string) => Effect.Effect<void, NativeSignInFailed | MagicLinkFailed>
  /** Step 7: exchanges `code` with the pending verifier, stores the response, deletes pending. */
  readonly complete: (code: string) => Effect.Effect<UserId, NativeSignInFailed>
  /** Sign-out / 401: deletes the stored session and any pending sign-in. */
  readonly clear: Effect.Effect<void>
}

/** SecureStore keys (`[A-Za-z0-9._-]`). */
export const SESSION_KEY = "tanren.session"
export const PENDING_KEY = "tanren.auth.pending"
/** A stored verifier older than this is ignored (the one-time token lives 5 min). */
export const PENDING_TTL_MS = 15 * 60 * 1000

const EXCHANGE_PATH = "/api/native/session"
const BEGIN_PATH = "/api/native/begin"

/** The slice of SecureStore this service uses: the real one on a device, a `Ref` in tests. */
export interface SecureKv {
  readonly get: (key: string) => Effect.Effect<Option.Option<string>, NativeSignInFailed>
  readonly set: (key: string, value: string) => Effect.Effect<void, NativeSignInFailed>
  readonly remove: (key: string) => Effect.Effect<void, NativeSignInFailed>
}

/** Verifier generation and its SHA-256 challenge; `expo-crypto` on a device. */
export interface PkceSource {
  readonly randomBytes: (count: number) => Effect.Effect<Uint8Array, NativeSignInFailed>
  readonly sha256: (data: Uint8Array<ArrayBuffer>) => Effect.Effect<Uint8Array, NativeSignInFailed>
}

export interface NativeSessionDeps {
  readonly kv: SecureKv
  readonly pkce: PkceSource
  /** The app's deep link for `auth/callback` (`Linking.createURL`). */
  readonly returnTo: Effect.Effect<string, NativeSignInFailed>
  readonly baseUrl: Effect.Effect<string>
}

const failed = (reason: NativeSignInFailed["reason"]) => new NativeSignInFailed({ reason })

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

const encodeChunk = (chunk: ReadonlyArray<number>): string => {
  const [a = 0, b = 0, c = 0] = chunk
  const n = (a << 16) | (b << 8) | c
  return [18, 12, 6, 0]
    .map((shift) => ALPHABET.charAt((n >> shift) & 63))
    .slice(0, chunk.length + 1)
    .join("")
}

/** RFC 4648 §5 base64url without padding (`btoa` is not relied on in Hermes). */
export const base64Url = (bytes: Uint8Array): string =>
  Arr.chunksOf(Arr.fromIterable(bytes), 3).map(encodeChunk).join("")

const StoredSession = Schema.fromJsonString(NativeSessionResponse)
const StoredPending = Schema.fromJsonString(PendingNativeSignIn)

const storage = (): NativeSignInFailed => failed("storage")

const make = (deps: NativeSessionDeps) =>
  Effect.gen(function* () {
    const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk)
    const { kv, pkce } = deps

    const readSession = kv.get(SESSION_KEY).pipe(
      Effect.map(Option.flatMap(Schema.decodeUnknownOption(StoredSession))),
      Effect.orElseSucceed(() => Option.none<NativeSessionResponse>()),
    )

    // Not filtered by the stored `expiresAt`: Better Auth extends a session on use, so the server
    // decides (`CurrentUser.fetchSession` clears the token when `get-session` answers `null`).
    const token = readSession.pipe(Effect.map(Option.map((stored) => stored.token)))

    const readPending = Effect.gen(function* () {
      const raw = yield* kv.get(PENDING_KEY)
      const now = yield* DateTime.now
      return raw.pipe(
        Option.flatMap(Schema.decodeUnknownOption(StoredPending)),
        Option.filter(
          (pending) =>
            DateTime.toEpochMillis(now) - DateTime.toEpochMillis(pending.createdAt) <=
            PENDING_TTL_MS,
        ),
      )
    })

    const begin = Effect.fn("NativeSession.begin")(function* (rawEmail: string) {
      const email = yield* Option.match(normalizeEmail(rawEmail), {
        onNone: () =>
          Effect.fail(new MagicLinkFailed({ reason: "invalid-email", status: Option.none() })),
        onSome: Effect.succeed,
      })
      const bytes = yield* pkce.randomBytes(32)
      const verifier = yield* Schema.decodeUnknownEffect(PkceVerifier)(base64Url(bytes)).pipe(
        Effect.mapError(storage),
      )
      const digest = yield* pkce.sha256(new TextEncoder().encode(verifier))
      const challenge = yield* Schema.decodeUnknownEffect(PkceChallenge)(base64Url(digest)).pipe(
        Effect.mapError(storage),
      )
      const returnTo = yield* deps.returnTo
      const createdAt = yield* DateTime.now
      const encoded = yield* Schema.encodeUnknownEffect(StoredPending)({
        verifier,
        createdAt,
      }).pipe(Effect.mapError(storage))
      yield* kv.set(PENDING_KEY, encoded)
      const body = yield* Schema.decodeUnknownEffect(NativeBeginRequest)({
        email,
        challenge,
        returnTo,
      }).pipe(
        Effect.mapError(
          () => new MagicLinkFailed({ reason: "invalid-email", status: Option.none() }),
        ),
      )
      // The worker signs the callbackURL and sends the link itself (design §4, session-export CSRF).
      const request = yield* HttpClientRequest.post(`${yield* deps.baseUrl}${BEGIN_PATH}`).pipe(
        HttpClientRequest.acceptJson,
        HttpClientRequest.schemaBodyJson(NativeBeginRequest)(body),
        Effect.mapError(storage),
      )
      yield* client
        .execute(request)
        .pipe(
          Effect.provideService(HttpClient.TracerPropagationEnabled, false),
          Effect.flatMap(HttpClientResponse.schemaBodyJson(NativeBeginResponse)),
          Effect.mapError(beginFailureOf),
        )
    })

    const exchange = (request: NativeSessionRequest) =>
      Effect.gen(function* () {
        const baseUrl = yield* deps.baseUrl
        const httpRequest = yield* HttpClientRequest.post(`${baseUrl}${EXCHANGE_PATH}`).pipe(
          HttpClientRequest.acceptJson,
          HttpClientRequest.schemaBodyJson(NativeSessionRequest)(request),
          Effect.mapError(() => failed("rejected")),
        )
        const response = yield* client
          .execute(httpRequest)
          // No trace headers; native fetch has no CORS preflight but web parity costs nothing.
          .pipe(
            Effect.provideService(HttpClient.TracerPropagationEnabled, false),
            Effect.mapError(failureOfHttp),
          )
        return yield* HttpClientResponse.schemaBodyJson(NativeSessionResponse)(response).pipe(
          Effect.mapError(() => failed("rejected")),
        )
      })

    const complete = Effect.fn("NativeSession.complete")(function* (rawCode: string) {
      const pending = yield* readPending
      if (Option.isNone(pending)) {
        return yield* failed("no-pending")
      }
      const code = yield* Schema.decodeUnknownEffect(NativeCode)(rawCode).pipe(
        Effect.mapError(() => failed("rejected")),
      )
      const session = yield* exchange({ code, verifier: pending.value.verifier })
      const encoded = yield* Schema.encodeUnknownEffect(StoredSession)(session).pipe(
        Effect.mapError(storage),
      )
      yield* kv.set(SESSION_KEY, encoded)
      yield* kv.remove(PENDING_KEY).pipe(Effect.ignore)
      return session.userId
    })

    const clear = Effect.forEach(
      [SESSION_KEY, PENDING_KEY],
      (key) => Effect.ignore(kv.remove(key)),
      {
        discard: true,
      },
    )

    return { token, begin, complete, clear } satisfies NativeSessionShape
  })

/** Same copy as the web request: a status error is `rejected` (with the status), else `unreachable`. */
const beginFailureOf = (
  cause: HttpClientError.HttpClientError | Schema.SchemaError,
): MagicLinkFailed =>
  "reason" in cause && cause.reason._tag === "StatusCodeError"
    ? new MagicLinkFailed({
        reason: "rejected",
        status: Option.some(cause.reason.response.status),
      })
    : new MagicLinkFailed({ reason: "unreachable", status: Option.none() })

/** 4xx = the worker refused (`rejected`); anything else (network, 5xx) = `unreachable`. */
const failureOfHttp = (cause: HttpClientError.HttpClientError): NativeSignInFailed =>
  cause.reason._tag === "StatusCodeError" &&
  cause.reason.response.status >= 400 &&
  cause.reason.response.status < 500
    ? failed("rejected")
    : failed("unreachable")

/** Real SecureStore (iOS Keychain), imported lazily so Node and web never load it. */
const secureKv: SecureKv = {
  get: (key) =>
    Effect.tryPromise({
      try: () => import("expo-secure-store").then((store) => store.getItemAsync(key)),
      catch: storage,
    }).pipe(Effect.map(Option.fromNullishOr)),
  set: (key, value) =>
    Effect.tryPromise({
      try: () => import("expo-secure-store").then((store) => store.setItemAsync(key, value)),
      catch: storage,
    }),
  remove: (key) =>
    Effect.tryPromise({
      try: () => import("expo-secure-store").then((store) => store.deleteItemAsync(key)),
      catch: storage,
    }),
}

const expoPkce: PkceSource = {
  randomBytes: (count) =>
    Effect.tryPromise({
      try: () => import("expo-crypto").then((crypto) => crypto.getRandomBytes(count)),
      catch: storage,
    }),
  sha256: (data) =>
    Effect.tryPromise({
      try: () =>
        import("expo-crypto").then((crypto) =>
          crypto.digest(crypto.CryptoDigestAlgorithm.SHA256, data),
        ),
      catch: storage,
    }).pipe(Effect.map((buffer) => new Uint8Array(buffer))),
}

/** `exp://<host>/--/auth/callback` in Expo Go, `tanren://auth/callback` in a build. */
const expoReturnTo: Effect.Effect<string, NativeSignInFailed> = Effect.tryPromise({
  try: () => import("expo-linking").then((linking) => linking.createURL("auth/callback")),
  catch: storage,
})

export class NativeSession extends Context.Service<NativeSession, NativeSessionShape>()(
  "@tanren/NativeSession",
) {
  /** Web: no token, sign-in unavailable (cookies carry the session). */
  static readonly layerNone = Layer.succeed(
    this,
    this.of({
      token: Effect.succeed(Option.none()),
      begin: () => Effect.fail(failed("no-pending")),
      complete: () => Effect.fail(failed("no-pending")),
      clear: Effect.void,
    }),
  )

  /** Any deps (the seam the tests and `layer` share). Needs an HttpClient. */
  static readonly layerWith = (deps: NativeSessionDeps) => Layer.effect(this, make(deps))

  /** Native: SecureStore + expo-crypto + expo-linking. Web: `layerNone`. */
  static readonly layer = (
    process.env.EXPO_OS === "web"
      ? NativeSession.layerNone
      : NativeSession.layerWith({
          kv: secureKv,
          pkce: expoPkce,
          returnTo: expoReturnTo,
          baseUrl: apiBaseUrl,
        }).pipe(Layer.provide(FetchHttpClient.layer))
  ) satisfies Layer.Layer<NativeSession>

  /** Tests: key-value pairs in a `Ref`, WebCrypto PKCE (Node), fixed `returnTo` and base URL. */
  static readonly layerMemory = (
    store: Ref.Ref<Readonly<Record<string, string>>>,
    options: MemoryOptions = {},
  ) =>
    NativeSession.layerWith({
      kv: memoryKv(store),
      pkce: webCryptoPkce(options.randomBytes),
      returnTo: Effect.succeed(options.returnTo ?? "exp://192.168.1.5:8081/--/auth/callback"),
      baseUrl: Effect.succeed(options.baseUrl ?? "http://api.test"),
    }).pipe(Layer.provide(FetchHttpClient.layer))
}

export interface MemoryOptions {
  readonly returnTo?: string
  readonly baseUrl?: string
  /** Fixed "random" bytes (e.g. the RFC 7636 verifier's); default WebCrypto. */
  readonly randomBytes?: (count: number) => Uint8Array
}

const memoryKv = (store: Ref.Ref<Readonly<Record<string, string>>>): SecureKv => ({
  get: (key) => Ref.get(store).pipe(Effect.map((all) => Option.fromNullishOr(all[key]))),
  set: (key, value) => Ref.update(store, (all) => ({ ...all, [key]: value })),
  remove: (key) =>
    Ref.update(store, (all) =>
      Object.fromEntries(Object.entries(all).filter(([name]) => name !== key)),
    ),
})

const webCryptoPkce = (randomBytes?: (count: number) => Uint8Array): PkceSource => ({
  randomBytes: (count) =>
    Effect.sync(() => randomBytes?.(count) ?? crypto.getRandomValues(new Uint8Array(count))),
  sha256: (data) =>
    Effect.tryPromise({ try: () => crypto.subtle.digest("SHA-256", data), catch: storage }).pipe(
      Effect.map((buffer) => new Uint8Array(buffer)),
    ),
})

/** User-facing copy for each failure (no codes, no tokens). */
export const nativeSignInFailureMessage = (reason: NativeSignInFailed["reason"]): string =>
  Match.value(reason).pipe(
    Match.when("link-invalid", () => "That link expired. Request a new one."),
    Match.when("rejected", () => "That sign-in was refused. Request a new link."),
    Match.when("no-pending", () => "Start sign-in in this app, then open the link on this iPhone."),
    Match.when("unreachable", () => "Could not reach the server. Check your connection and retry."),
    Match.when("storage", () => "Could not save the sign-in on this device."),
    Match.exhaustive,
  )

/**
 * What the `auth/callback` deep link says before any request: `?error=` (the worker's link page
 * reports an expired or used link) is `link-invalid`; no code is `rejected`; else exchange.
 */
export const callbackFailure = (params: {
  readonly code?: string | undefined
  readonly error?: string | undefined
}): Option.Option<NativeSignInFailed["reason"]> =>
  Option.fromNullishOr(params.error).pipe(
    Option.filter((error) => error.length > 0),
    Option.as("link-invalid" as const),
    Option.orElse(() =>
      Option.fromNullishOr(params.code).pipe(
        Option.filter((code) => code.length > 0),
        Option.match({
          onNone: () => Option.some("rejected" as const),
          onSome: () => Option.none(),
        }),
      ),
    ),
  )

/** Adds `Authorization: Bearer` when a token is stored; otherwise the request is unchanged. */
export const withSession = (
  request: HttpClientRequest.HttpClientRequest,
): Effect.Effect<HttpClientRequest.HttpClientRequest, never, NativeSession> =>
  NativeSession.use((session) => session.token).pipe(
    Effect.map(
      Option.match({
        onNone: () => request,
        onSome: (token) => request.pipe(HttpClientRequest.bearerToken(token)),
      }),
    ),
  )
