import { UserTokens } from "@tanren/db"
import type { McpScope, OAuthProps, UserId } from "@tanren/shared"
import { Context, Data, Effect, HashMap, Layer, Option, Ref } from "effect"
import { Sessions } from "../auth/Sessions"
import { type ConsentRequest, Tokens } from "../auth/Tokens"
import { WorkerConfig } from "../Config"
import { ClientResolver } from "./clients"
import {
  type ApprovedConsent,
  type AuthorizationRequest,
  type ConsentDescription,
  type ConsentTransaction,
  clearConsentCookie,
  consentCookie,
  type DeniedConsent,
  describeConsent,
  parseAuthorization,
  readConsentCookie,
  sameSecret,
  withQuery,
} from "./consent"

/** The parsed authorization request (local since the library left, ADR-0022). */
export type AuthRequest = AuthorizationRequest

/**
 * An authorization step was refused. Internal: the authorize routes turn it into a page or a
 * redirect. `redirectTo` is Some only once the client's redirect URI was validated; without it the
 * caller must render locally and must not redirect.
 */
export class OAuthFailure extends Data.TaggedError("OAuthFailure")<{
  readonly message: string
  readonly code: Option.Option<string>
  readonly redirectTo: Option.Option<string>
}> {}

/** What the approve step hands over to mint the code. */
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

type StatelessDeps = Tokens | Sessions | UserTokens | ClientResolver | WorkerConfig

/** A parsed request or a consent handle's request → `AuthRequest` (a fresh copy of every field). */
const toAuthRequest = (request: AuthorizationRequest | ConsentRequest): AuthRequest => ({
  responseType: request.responseType,
  clientId: request.clientId,
  redirectUri: request.redirectUri,
  scope: [...request.scope],
  state: request.state,
  ...(request.codeChallenge === undefined ? {} : { codeChallenge: request.codeChallenge }),
  ...(request.codeChallengeMethod === undefined
    ? {}
    : { codeChallengeMethod: request.codeChallengeMethod }),
  ...(request.resource === undefined ? {} : { resource: request.resource }),
})

const toConsentRequest = (request: AuthRequest): ConsentRequest => ({
  responseType: request.responseType,
  clientId: request.clientId,
  redirectUri: request.redirectUri,
  scope: request.scope,
  state: request.state,
  ...(request.codeChallenge === undefined ? {} : { codeChallenge: request.codeChallenge }),
  ...(request.codeChallengeMethod === undefined
    ? {}
    : { codeChallengeMethod: request.codeChallengeMethod }),
  ...(request.resource === undefined ? {} : { resource: request.resource }),
})

export class OAuthApi extends Context.Service<OAuthApi, OAuthApiShape>()(
  "@tanren/worker/OAuthApi",
) {
  /**
   * The stateless authorization server (docs/design/auth-v2.md §5, §7) for one browser request:
   * the consent handle is a `Tokens.issueConsent` JWT bound to the signed-in user (`sub`) and to the
   * browser by the `__Host-tanren-consent` cookie (its `nonce`); approve checks both; the code is a
   * `Tokens.issueCode` JWT sent only in the 302 `Location`. `request` is the incoming request, read
   * by `beginConsent` (whose shape carries no request) for the signed-in user.
   */
  static readonly layerStateless = (input: {
    readonly request: Request
  }): Layer.Layer<OAuthApi, never, StatelessDeps> =>
    Layer.effect(
      OAuthApi,
      Effect.gen(function* () {
        const tokens = yield* Tokens
        const sessions = yield* Sessions
        const users = yield* UserTokens
        const clients = yield* ClientResolver
        const config = yield* WorkerConfig
        const failure = (message: string, code = "invalid_request") =>
          new OAuthFailure({ message, code: Option.some(code), redirectTo: Option.none() })
        const resolve = (clientId: string) =>
          clients
            .resolve(clientId)
            .pipe(Effect.mapError(() => failure("Invalid client", "invalid_client")))
        const signedIn = (headers: Headers) =>
          sessions.current(headers).pipe(
            Effect.mapError(() => failure("Session store unavailable", "temporarily_unavailable")),
            Effect.flatMap(
              Option.match({
                onNone: () => Effect.fail(failure("Not signed in", "access_denied")),
                onSome: Effect.succeed,
              }),
            ),
          )
        /** Verifies the handle and the browser binding (cookie nonce == handle nonce). */
        const openHandle = (request: Request, handle: string) =>
          Effect.gen(function* () {
            const consent = yield* tokens
              .verifyConsent(handle)
              .pipe(Effect.mapError(() => failure("Invalid or expired consent handle")))
            const cookie = readConsentCookie(request.headers)
            if (!Option.exists(cookie, (nonce) => sameSecret(nonce, consent.nonce))) {
              return yield* failure("Consent was not started in this browser")
            }
            return consent
          })
        const cleared = () => new Headers({ "set-cookie": clearConsentCookie })
        return OAuthApi.of({
          parseAuthRequest: (request) =>
            Effect.gen(function* () {
              const url = new URL(request.url)
              const clientId = url.searchParams.get("client_id")
              if (clientId === null || clientId.length === 0) {
                return yield* failure("Missing client_id")
              }
              const client = yield* resolve(clientId)
              const { refusal, request: parsed } = parseAuthorization(
                url,
                client,
                config.mcpResourceUrl,
              )
              if (Option.isSome(refusal)) {
                return yield* new OAuthFailure({
                  message: refusal.value.message,
                  code: Option.some(refusal.value.code),
                  redirectTo: refusal.value.redirect,
                })
              }
              return toAuthRequest(parsed)
            }),
          describeConsent: (authRequest) =>
            resolve(authRequest.clientId).pipe(
              Effect.map((client) => {
                const description = describeConsent(client, authRequest)
                return { ...description, scope: [...description.scope] }
              }),
            ),
          beginConsent: (authRequest) =>
            Effect.gen(function* () {
              const userId = yield* signedIn(input.request.headers)
              const { handle, nonce } = yield* tokens.issueConsent({
                userId,
                request: toConsentRequest(authRequest),
              })
              return {
                handle,
                headers: new Headers([
                  ["set-cookie", consentCookie(nonce)],
                  ["x-frame-options", "DENY"],
                ]),
              }
            }),
          approveConsent: (request, handle) =>
            Effect.gen(function* () {
              const consent = yield* openHandle(request, handle)
              const userId = yield* signedIn(request.headers)
              if (userId !== consent.userId) {
                return yield* failure("Consent belongs to another user", "access_denied")
              }
              return { request: toAuthRequest(consent.request), headers: cleared() }
            }),
          denyConsent: (request, handle) =>
            openHandle(request, handle).pipe(
              Effect.map((consent) => {
                const redirectTo = withQuery(consent.request.redirectUri, {
                  error: "access_denied",
                  state: consent.request.state,
                })
                const headers = cleared()
                return {
                  request: toAuthRequest(consent.request),
                  redirectTo,
                  headers: new Headers([...headers.entries(), ["location", redirectTo]]),
                }
              }),
            ),
          completeAuthorization: ({ request, userId, scope }) =>
            Effect.gen(function* () {
              if (request.codeChallenge === undefined || request.codeChallengeMethod !== "S256") {
                return yield* failure("PKCE S256 is required")
              }
              const gens = yield* users
                .tokenGens(userId)
                .pipe(Effect.mapError(() => failure("Unknown user", "access_denied")))
              const code = yield* tokens.issueCode({
                userId,
                scopes: scope,
                clientId: request.clientId,
                gen: gens.mcp,
                redirectUri: request.redirectUri,
                codeChallenge: request.codeChallenge,
              })
              return { redirectTo: withQuery(request.redirectUri, { code, state: request.state }) }
            }),
        })
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
