// Type-only imports: the package's JS imports `cloudflare:workers`, so a value import would break
// the Node test project. `AuthorizationError` is therefore recognised by shape (`fromRejection`).
import type {
  ApprovedConsent,
  AuthRequest,
  ConsentDescription,
  ConsentTransaction,
  DeniedConsent,
  OAuthHelpers,
} from "@cloudflare/workers-oauth-provider"
import type { McpScope, OAuthProps, UserId } from "@tanren/shared"
import { Context, Data, Effect, HashMap, Layer, Option, Ref, Schema } from "effect"

/**
 * A provider helper rejected. Internal: the authorize routes turn it into a page or a redirect.
 * `redirectTo` is Some only when the provider validated the client's redirect URI
 * (`AuthorizationError.redirectTo`, built by the package's `authorizationErrorRedirect`); without
 * it the caller must render locally and must not redirect.
 */
export class OAuthFailure extends Data.TaggedError("OAuthFailure")<{
  readonly message: string
  readonly code: Option.Option<string>
  readonly redirectTo: Option.Option<string>
}> {
  /** Maps whatever a helper rejected with; an `AuthorizationError` keeps its code and redirect. */
  static fromRejection(cause: unknown): OAuthFailure {
    return Option.match(decodeAuthorizationError(cause), {
      onNone: () =>
        new OAuthFailure({
          message: cause instanceof Error ? cause.message : "OAuth provider failure",
          code: Option.none(),
          redirectTo: Option.none(),
        }),
      onSome: (error) =>
        new OAuthFailure({
          message: error.description,
          code: Option.some(error.code),
          redirectTo: Option.fromNullishOr(error.redirectTo),
        }),
    })
  }
}

/** The fields of the package's `AuthorizationError` we rely on (dist/oauth-provider.d.ts:461). */
const AuthorizationErrorShape = Schema.Struct({
  name: Schema.Literal("AuthorizationError"),
  code: Schema.String,
  description: Schema.String,
  redirectTo: Schema.optional(Schema.String),
})
const decodeAuthorizationError = Schema.decodeUnknownOption(AuthorizationErrorShape)

/** What the approve step hands to the provider; `props` become `ctx.props` on `/mcp`. */
export interface CompleteAuthorization {
  readonly request: AuthRequest
  readonly userId: UserId
  readonly scope: ReadonlyArray<McpScope>
  readonly props: OAuthProps
}

export interface OAuthApiShape {
  readonly parseAuthRequest: (request: Request) => Effect.Effect<AuthRequest, OAuthFailure>
  readonly describeConsent: (
    authRequest: AuthRequest,
  ) => Effect.Effect<ConsentDescription, OAuthFailure>
  /** The consent handle plus the headers (binding cookie, anti-framing) to send with the page. */
  readonly beginConsent: (
    authRequest: AuthRequest,
  ) => Effect.Effect<ConsentTransaction, OAuthFailure>
  /** Consumes the handle; the returned request is the stored one, with the scopes the client asked for. */
  readonly approveConsent: (
    request: Request,
    handle: string,
  ) => Effect.Effect<ApprovedConsent, OAuthFailure>
  readonly denyConsent: (
    request: Request,
    handle: string,
  ) => Effect.Effect<DeniedConsent, OAuthFailure>
  readonly completeAuthorization: (
    options: CompleteAuthorization,
  ) => Effect.Effect<{ readonly redirectTo: string }, OAuthFailure>
}

const attempt = <A>(run: () => Promise<A>): Effect.Effect<A, OAuthFailure> =>
  Effect.tryPromise({ try: run, catch: OAuthFailure.fromRejection })

export class OAuthApi extends Context.Service<OAuthApi, OAuthApiShape>()(
  "@tanren/worker/OAuthApi",
) {
  /** Per request, over the helpers the provider injects as `env.OAUTH_PROVIDER`. */
  static readonly layerFromHelpers = (helpers: OAuthHelpers): Layer.Layer<OAuthApi> =>
    Layer.succeed(
      OAuthApi,
      OAuthApi.of({
        parseAuthRequest: (request) => attempt(() => helpers.parseAuthRequest(request)),
        describeConsent: (authRequest) => attempt(() => helpers.describeConsent(authRequest)),
        beginConsent: (authRequest) => attempt(() => helpers.beginConsent(authRequest)),
        approveConsent: (request, handle) => attempt(() => helpers.approveConsent(request, handle)),
        denyConsent: (request, handle) => attempt(() => helpers.denyConsent(request, handle)),
        completeAuthorization: ({ request, userId, scope, props }) =>
          attempt(() =>
            helpers.completeAuthorization({
              request,
              userId,
              metadata: {},
              scope: [...scope],
              props,
            }),
          ),
      }),
    )

  /**
   * Tests: an in-memory provider. Requests need `client_id=fake-client` and a `redirect_uri`
   * (else a failure without redirect) and `response_type=code` (else a failure with redirect).
   * Handles are `handle-1`, `handle-2`, … and single use; the browser binding is not checked.
   * Completed authorizations are readable through `FakeOAuth`.
   */
  static readonly layerFake: Layer.Layer<OAuthApi | FakeOAuth> = Layer.effectContext(
    Effect.gen(function* () {
      const counter = yield* Ref.make(0)
      const handles = yield* Ref.make(HashMap.empty<string, AuthRequest>())
      const completions = yield* Ref.make<ReadonlyArray<CompleteAuthorization>>([])
      const take = (handle: string) =>
        Ref.modify(handles, (all) => [HashMap.get(all, handle), HashMap.remove(all, handle)]).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () =>
                Effect.fail(
                  new OAuthFailure({
                    message: "Invalid or expired consent handle",
                    code: Option.some("invalid_request"),
                    redirectTo: Option.none(),
                  }),
                ),
              onSome: Effect.succeed,
            }),
          ),
        )
      const api = OAuthApi.of({
        parseAuthRequest: (request) => Effect.suspend(() => fakeParse(request)),
        describeConsent: (authRequest) =>
          Effect.succeed({
            clientId: authRequest.clientId,
            clientName: FAKE_CLIENT_NAME,
            redirectUri: authRequest.redirectUri,
            redirectHost: new URL(authRequest.redirectUri).host,
            redirectIsLoopback: new URL(authRequest.redirectUri).hostname === "localhost",
            scope: authRequest.scope,
          }),
        beginConsent: (authRequest) =>
          Effect.gen(function* () {
            const handle = `handle-${yield* Ref.updateAndGet(counter, (n) => n + 1)}`
            yield* Ref.update(handles, HashMap.set(handle, authRequest))
            return {
              handle,
              headers: new Headers({
                "set-cookie": `__Host-oauth-consent=${handle}; Path=/; Secure; HttpOnly`,
                "x-frame-options": "DENY",
              }),
            }
          }),
        approveConsent: (_request, handle) =>
          take(handle).pipe(
            Effect.map((authRequest) => ({
              request: authRequest,
              headers: new Headers({ "set-cookie": "__Host-oauth-consent=; Max-Age=0" }),
            })),
          ),
        denyConsent: (_request, handle) =>
          take(handle).pipe(
            Effect.map((authRequest) => {
              const redirectTo = withQuery(authRequest.redirectUri, {
                error: "access_denied",
                state: authRequest.state,
              })
              return {
                request: authRequest,
                redirectTo,
                headers: new Headers({
                  location: redirectTo,
                  "set-cookie": "__Host-oauth-consent=; Max-Age=0",
                }),
              }
            }),
          ),
        completeAuthorization: (options) =>
          Ref.update(completions, (all) => [...all, options]).pipe(
            Effect.as({
              redirectTo: withQuery(options.request.redirectUri, {
                code: "fake-code",
                state: options.request.state,
              }),
            }),
          ),
      })
      return Context.make(OAuthApi, api).pipe(
        Context.add(FakeOAuth, FakeOAuth.of({ completions: Ref.get(completions) })),
      )
    }),
  )
}

export interface FakeOAuthShape {
  /** Every `completeAuthorization` call so far, oldest first. */
  readonly completions: Effect.Effect<ReadonlyArray<CompleteAuthorization>>
}

export class FakeOAuth extends Context.Service<FakeOAuth, FakeOAuthShape>()(
  "@tanren/worker/FakeOAuth",
) {}

export const FAKE_CLIENT_ID = "fake-client"
/** Deliberately hostile, so page tests prove client-supplied strings are escaped. */
export const FAKE_CLIENT_NAME = `Evil "Client" <script>alert(1)</script>`

const withQuery = (uri: string, query: Readonly<Record<string, string>>): string =>
  `${uri}${uri.includes("?") ? "&" : "?"}${new URLSearchParams(query).toString()}`

const fakeParse = (request: Request): Effect.Effect<AuthRequest, OAuthFailure> => {
  const url = new URL(request.url)
  const param = (name: string) => Option.fromNullishOr(url.searchParams.get(name))
  const clientId = param("client_id")
  const redirectUri = param("redirect_uri")
  const state = Option.getOrElse(param("state"), () => "")
  if (Option.isNone(redirectUri) || Option.getOrUndefined(clientId) !== FAKE_CLIENT_ID) {
    return Effect.fail(
      new OAuthFailure({
        message: "Invalid client_id",
        code: Option.some("invalid_request"),
        redirectTo: Option.none(),
      }),
    )
  }
  if (Option.getOrUndefined(param("response_type")) !== "code") {
    return Effect.fail(
      new OAuthFailure({
        message: "Unsupported response type",
        code: Option.some("unsupported_response_type"),
        redirectTo: Option.some(
          withQuery(redirectUri.value, { error: "unsupported_response_type", state }),
        ),
      }),
    )
  }
  return Effect.succeed({
    responseType: "code",
    clientId: FAKE_CLIENT_ID,
    redirectUri: redirectUri.value,
    scope: Option.getOrElse(param("scope"), () => "")
      .split(" ")
      .filter((scope) => scope.length > 0),
    state,
    issuer: url.origin,
  })
}
