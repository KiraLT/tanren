import { Array as Arr, Context, Data, Effect, Layer, Option, Schema } from "effect"
import { Tokens } from "../auth/Tokens"

// Stateless client resolution (docs/design/auth-v2.md §5, §7): an https `client_id` with a path is a
// Client ID Metadata Document URL, fetched with tight limits; anything else must be a DCR client id
// (a signed JWT, `Tokens.issueClientId`). Nothing is stored.

/** Fetch limits for a metadata document (§7). */
export const CIMD_TIMEOUT = "5 seconds"
export const CIMD_MAX_BYTES = 5 * 1024
export const CIMD_MAX_AGE_SECONDS = 3600
export const CLIENT_NAME_MAX = 64
export const CIMD_CACHE = "tanren:cimd:v1"

const LOOPBACK_HOSTS: ReadonlyArray<string> = ["localhost", "127.0.0.1", "[::1]"]

/** Internal: the client is unknown or unusable. Answered as `invalid_client`, never with a stack. */
export class InvalidClient extends Data.TaggedError("InvalidClient")<{ readonly reason: string }> {}

/** A client the authorization server may talk to. A worker-only view, never on the wire. */
export interface ResolvedClient {
  readonly clientId: string
  readonly clientName: string
  /** Hostname of the document URL, only for a fetched and validated CIMD client. */
  readonly clientDomain: Option.Option<string>
  readonly clientUri: Option.Option<string>
  readonly logoUri: Option.Option<string>
  readonly redirectUris: ReadonlyArray<string>
}

const parseUrl = Option.liftThrowable((raw: string) => new URL(raw))

/**
 * `raw` parsed, if it is already in canonical form (`new URL(raw).href === raw`, so no dot segments,
 * `%2e%2e`, odd ports or case games survive), with no userinfo and no fragment.
 */
export const canonicalUrl = (raw: string): Option.Option<URL> =>
  Option.filter(
    parseUrl(raw),
    (url) =>
      url.href === raw &&
      url.username === "" &&
      url.password === "" &&
      url.hash === "" &&
      !raw.includes("#"),
  )

/** §7: `https:` on any host, or `http:` on a loopback host (any port); canonical, no fragment, no userinfo. */
export const isAcceptableRedirectUri = (raw: string): boolean =>
  Option.exists(
    canonicalUrl(raw),
    (url) =>
      url.protocol === "https:" ||
      (url.protocol === "http:" && LOOPBACK_HOSTS.includes(url.hostname)),
  )

export const isLoopbackRedirect = (raw: string): boolean =>
  Option.exists(parseUrl(raw), (url) => LOOPBACK_HOSTS.includes(url.hostname))

/** An https, canonical URL with a non-root path: the CIMD shape (library: `rawPath(clientId) !== ""`). */
export const isMetadataDocumentUrl = (clientId: string): boolean =>
  Option.exists(
    canonicalUrl(clientId),
    (url) => url.protocol === "https:" && url.pathname !== "/" && url.pathname !== "",
  )

const MetadataDocument = Schema.Struct({
  client_id: Schema.String,
  client_name: Schema.NonEmptyString,
  redirect_uris: Schema.NonEmptyArray(Schema.String),
  client_uri: Schema.optionalKey(Schema.String),
  logo_uri: Schema.optionalKey(Schema.String),
  client_secret: Schema.optionalKey(Schema.Unknown),
})
const decodeDocument = Schema.decodeUnknownOption(Schema.fromJsonString(MetadataDocument))

/** The parts of the Workers runtime CIMD resolution uses; tests pass fakes. */
export interface ClientRuntime {
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>
  /** `caches.default` in the Worker; `None` disables caching (Node tests). */
  readonly cache: Effect.Effect<Option.Option<Cache>>
}

export interface ClientResolverShape {
  readonly resolve: (clientId: string) => Effect.Effect<ResolvedClient, InvalidClient>
}

const invalid = (reason: string) => new InvalidClient({ reason })

const maxAgeOf = (response: Response): number =>
  Option.fromNullishOr(response.headers.get("cache-control")).pipe(
    Option.flatMap((value) => Option.fromNullishOr(/max-age=(\d+)/.exec(value)?.[1])),
    Option.map(Number),
    Option.match({
      onNone: () => CIMD_MAX_AGE_SECONDS,
      onSome: (age) => Math.min(age, CIMD_MAX_AGE_SECONDS),
    }),
  )

/** Validated document → client; the document's `client_id` must be the request's, byte for byte. */
export const clientFromDocument = (
  clientId: string,
  body: string,
): Effect.Effect<ResolvedClient, InvalidClient> =>
  Option.match(decodeDocument(body), {
    onNone: () => Effect.fail(invalid("malformed metadata document")),
    onSome: (doc) =>
      doc.client_id !== clientId
        ? Effect.fail(invalid("document client_id mismatch"))
        : doc.client_secret !== undefined
          ? Effect.fail(invalid("document carries a client_secret"))
          : !Arr.every(doc.redirect_uris, isAcceptableRedirectUri)
            ? Effect.fail(invalid("unsafe redirect_uri in document"))
            : Effect.succeed({
                clientId,
                clientName: doc.client_name.slice(0, CLIENT_NAME_MAX),
                clientDomain: Option.some(new URL(clientId).hostname),
                clientUri: Option.fromNullishOr(doc.client_uri),
                logoUri: Option.fromNullishOr(doc.logo_uri),
                redirectUris: doc.redirect_uris,
              }),
  })

const readBody = (response: Response): Effect.Effect<string, InvalidClient> =>
  Effect.gen(function* () {
    if (response.status !== 200) {
      // 3xx included: redirects are never followed (`redirect: "manual"`).
      return yield* invalid(`metadata document status ${response.status}`)
    }
    const type = response.headers.get("content-type") ?? ""
    if (!/^application\/([\w.+-]+\+)?json\b/i.test(type)) {
      return yield* invalid("metadata document is not JSON")
    }
    const declared = Number(response.headers.get("content-length") ?? "0")
    if (declared > CIMD_MAX_BYTES) {
      return yield* invalid("metadata document too large")
    }
    // The length header is only a hint (chunked or absent): the stream itself is capped.
    return yield* Option.match(Option.fromNullishOr(response.body), {
      onNone: () => Effect.succeed(""),
      onSome: readCapped,
    })
  })

/** `Response.body` chunks; `ArrayBuffer`-backed, which `Blob` requires. */
type Bytes = Uint8Array<ArrayBuffer>
type ByteReader = ReadableStreamDefaultReader<Bytes>

/** Reads chunk by chunk and fails as soon as the running total passes `CIMD_MAX_BYTES`. */
const readChunks = (
  reader: ByteReader,
  chunks: ReadonlyArray<Bytes>,
  total: number,
): Effect.Effect<ReadonlyArray<Bytes>, InvalidClient> =>
  Effect.tryPromise({
    try: () => reader.read(),
    catch: () => invalid("metadata document unreadable"),
  }).pipe(
    Effect.flatMap((next) =>
      next.done
        ? Effect.succeed(chunks)
        : total + next.value.byteLength > CIMD_MAX_BYTES
          ? Effect.fail(invalid("metadata document too large"))
          : readChunks(reader, [...chunks, next.value], total + next.value.byteLength),
    ),
  )

/**
 * The body as text, at most `CIMD_MAX_BYTES`. The reader is always cancelled afterwards (too large,
 * timed out, done): fire and forget, so a slow `cancel()` cannot hold the request past the timeout.
 */
const readCapped = (body: ReadableStream<Bytes>): Effect.Effect<string, InvalidClient> =>
  Effect.acquireUseRelease(
    Effect.sync(() => body.getReader()),
    (reader) =>
      readChunks(reader, [], 0).pipe(
        Effect.flatMap((chunks) =>
          Effect.tryPromise({
            try: () => new Blob([...chunks]).text(),
            catch: () => invalid("metadata document unreadable"),
          }),
        ),
      ),
    (reader) =>
      Effect.sync(() => {
        reader.cancel().catch(() => undefined)
      }),
  )

const makeResolver = (runtime: ClientRuntime) =>
  Effect.gen(function* () {
    const tokens = yield* Tokens

    const fetchDocument = (clientId: string): Effect.Effect<ResolvedClient, InvalidClient> =>
      Effect.gen(function* () {
        const cache = yield* runtime.cache
        const cached = yield* Option.match(cache, {
          onNone: () => Effect.succeed(Option.none<Response>()),
          onSome: (c) =>
            Effect.tryPromise(() => c.match(clientId)).pipe(
              Effect.map(Option.fromNullishOr),
              Effect.orElseSucceed(() => Option.none<Response>()),
            ),
        })
        if (Option.isSome(cached)) {
          const body = yield* Effect.tryPromise({
            try: () => cached.value.text(),
            catch: () => invalid("cache unreadable"),
          })
          return yield* clientFromDocument(clientId, body)
        }
        // One timeout over headers AND body: a slow-drip body must not outlive it (§7).
        const { response, body } = yield* Effect.tryPromise({
          try: (signal) =>
            runtime.fetch(clientId, {
              redirect: "manual",
              signal,
              headers: { accept: "application/json" },
            }),
          catch: () => invalid("metadata document fetch failed"),
        }).pipe(
          Effect.flatMap((fetched) =>
            Effect.map(readBody(fetched), (text) => ({ response: fetched, body: text })),
          ),
          Effect.timeoutOrElse({
            duration: CIMD_TIMEOUT,
            orElse: () => Effect.fail(invalid("metadata document fetch timed out")),
          }),
        )
        const client = yield* clientFromDocument(clientId, body)
        const maxAge = maxAgeOf(response)
        yield* Option.match(cache, {
          onNone: () => Effect.void,
          onSome: (c) =>
            Effect.tryPromise(() =>
              c.put(
                clientId,
                new Response(body, {
                  headers: {
                    "content-type": "application/json",
                    "cache-control": `max-age=${maxAge}`,
                  },
                }),
              ),
            ).pipe(Effect.ignore),
        })
        return client
      })

    const resolve = (clientId: string): Effect.Effect<ResolvedClient, InvalidClient> =>
      isMetadataDocumentUrl(clientId)
        ? fetchDocument(clientId)
        : tokens.verifyClientId(clientId).pipe(
            Effect.mapError(() => invalid("unknown client")),
            Effect.map(
              (client): ResolvedClient => ({
                clientId,
                clientName: client.clientName,
                clientDomain: Option.none(),
                clientUri: Option.none(),
                logoUri: Option.none(),
                redirectUris: client.redirectUris,
              }),
            ),
          )

    return { resolve }
  })

/** The Workers runtime: global `fetch` and `caches.default`, both touched only inside a request. */
const workersRuntime: ClientRuntime = {
  fetch: (url, init) => fetch(url, init),
  // A named cache (the installed workers-types do not declare `caches.default`); same Cache API.
  cache: Effect.tryPromise(() => caches.open(CIMD_CACHE)).pipe(
    Effect.map(Option.some),
    Effect.orElseSucceed(() => Option.none<Cache>()),
  ),
}

export class ClientResolver extends Context.Service<ClientResolver, ClientResolverShape>()(
  "@tanren/worker/ClientResolver",
) {
  static readonly layer: Layer.Layer<ClientResolver, never, Tokens> = Layer.effect(
    this,
    makeResolver(workersRuntime),
  )
  /** Tests: a fake fetch and cache. */
  static readonly layerWith = (
    runtime: ClientRuntime,
  ): Layer.Layer<ClientResolver, never, Tokens> => Layer.effect(this, makeResolver(runtime))
}

// ---------------------------------------------------------------------------------------------
// Stateless dynamic client registration (RFC 7591), `POST /oauth/register`.

export const MAX_REDIRECT_URIS = 10
export const MAX_REDIRECT_URI_LENGTH = 2048

const RegistrationBody = Schema.Struct({
  redirect_uris: Schema.NonEmptyArray(
    Schema.String.check(Schema.isMaxLength(MAX_REDIRECT_URI_LENGTH)),
  ).check(Schema.isMaxLength(MAX_REDIRECT_URIS)),
  client_name: Schema.optionalKey(Schema.String),
  token_endpoint_auth_method: Schema.optionalKey(Schema.String),
})
const decodeRegistration = Schema.decodeUnknownOption(Schema.fromJsonString(RegistrationBody))

const DEFAULT_CLIENT_NAME = "Unnamed app"

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      pragma: "no-cache",
    },
  })

const registrationError = (error: string, description: string) =>
  json(400, { error, error_description: description })

/** `POST /oauth/register`: validates and answers a signed `client_id`; no secret, no storage. */
export const register = (request: Request): Effect.Effect<Response, never, Tokens> =>
  Effect.gen(function* () {
    const raw = yield* Effect.tryPromise(() => request.text()).pipe(Effect.orElseSucceed(() => ""))
    const body = decodeRegistration(raw)
    if (Option.isNone(body)) {
      return registrationError(
        "invalid_client_metadata",
        "redirect_uris is required: 1-10 URIs of at most 2048 characters",
      )
    }
    const { redirect_uris, client_name, token_endpoint_auth_method } = body.value
    if (!Arr.every(redirect_uris, isAcceptableRedirectUri)) {
      return registrationError("invalid_redirect_uri", "unsupported redirect_uri")
    }
    if (token_endpoint_auth_method !== undefined && token_endpoint_auth_method !== "none") {
      return registrationError("invalid_client_metadata", "only public clients are supported")
    }
    const clientName = (client_name ?? DEFAULT_CLIENT_NAME).trim()
    if (clientName.length === 0 || clientName.length > CLIENT_NAME_MAX) {
      return registrationError("invalid_client_metadata", "client_name must be 1-64 characters")
    }
    const tokens = yield* Tokens
    const clientId = yield* tokens.issueClientId({ redirectUris: redirect_uris, clientName })
    return json(201, {
      client_id: clientId,
      token_endpoint_auth_method: "none",
      redirect_uris,
      client_name: clientName,
    })
  })
