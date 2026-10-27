import { Array as Arr, Option } from "effect"
import { isAcceptableRedirectUri, isLoopbackRedirect, type ResolvedClient } from "./clients"

// The stateless consent step (docs/design/auth-v2.md §5, §7): what the page describes, the parsed
// authorization request, and the browser-binding cookie whose value is the handle's `nonce`.

/**
 * What the consent page shows: the library's `ConsentDescription` fields, local now. Trust is still
 * derived from `clientDomain` by `authorize.ts` (`consentView` → `knownClients.clientTrust`).
 */
export interface ConsentDescription {
  readonly clientId: string
  readonly clientName: string
  readonly clientDomain?: string
  readonly clientUri?: string
  readonly logoUri?: string
  readonly redirectUri: string
  readonly redirectHost: string
  readonly redirectIsLoopback: boolean
  readonly scope: ReadonlyArray<string>
}

/** The parsed authorization request (the library's `AuthRequest` fields). */
export interface AuthorizationRequest {
  readonly responseType: string
  readonly clientId: string
  readonly redirectUri: string
  readonly scope: ReadonlyArray<string>
  readonly state: string
  readonly codeChallenge?: string
  readonly codeChallengeMethod?: string
  readonly resource?: string
}

/** The consent handle plus the headers (binding cookie, anti-framing) to send with the page. */
export interface ConsentTransaction {
  readonly handle: string
  readonly headers: Headers
}

export interface ApprovedConsent {
  readonly request: AuthorizationRequest
  readonly headers: Headers
}

export interface DeniedConsent {
  readonly request: AuthorizationRequest
  readonly redirectTo: string
  readonly headers: Headers
}

export const CONSENT_COOKIE = "__Host-tanren-consent"
export const CONSENT_COOKIE_MAX_AGE = 600

export const consentCookie = (nonce: string): string =>
  `${CONSENT_COOKIE}=${nonce}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${CONSENT_COOKIE_MAX_AGE}`

export const clearConsentCookie = `${CONSENT_COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`

/** The binding cookie's value from a request's `Cookie` header. */
export const readConsentCookie = (headers: Headers): Option.Option<string> =>
  Option.fromNullishOr(headers.get("cookie")).pipe(
    Option.flatMap((raw) =>
      Arr.findFirst(raw.split(";"), (part) => part.trim().startsWith(`${CONSENT_COOKIE}=`)),
    ),
    Option.map((part) => part.trim().slice(CONSENT_COOKIE.length + 1)),
    Option.filter((value) => value.length > 0),
  )

/** Constant-time string equality (the nonce check must not leak a prefix through timing). */
export const sameSecret = (a: string, b: string): boolean =>
  a.length === b.length &&
  Arr.reduce(
    Arr.zip(Arr.fromIterable(a), Arr.fromIterable(b)),
    0,
    (acc, [x, y]) => acc | (x.charCodeAt(0) ^ y.charCodeAt(0)),
  ) === 0

export const describeConsent = (
  client: ResolvedClient,
  request: AuthorizationRequest,
): ConsentDescription => ({
  clientId: client.clientId,
  clientName: client.clientName,
  ...Option.match(client.clientDomain, {
    onNone: () => ({}),
    onSome: (clientDomain) => ({ clientDomain }),
  }),
  ...Option.match(client.clientUri, { onNone: () => ({}), onSome: (clientUri) => ({ clientUri }) }),
  ...Option.match(client.logoUri, { onNone: () => ({}), onSome: (logoUri) => ({ logoUri }) }),
  redirectUri: request.redirectUri,
  redirectHost: Option.match(parseUrl(request.redirectUri), {
    onNone: () => "",
    onSome: (url) => url.host,
  }),
  redirectIsLoopback: isLoopbackRedirect(request.redirectUri),
  scope: request.scope,
})

/** `uri` with `query` appended (keeps an existing query). */
export const withQuery = (uri: string, query: Readonly<Record<string, string>>): string =>
  `${uri}${uri.includes("?") ? "&" : "?"}${new URLSearchParams(query).toString()}`

const PKCE_CHALLENGE = /^[A-Za-z0-9_-]{43}$/

const parseUrl = Option.liftThrowable((raw: string) => new URL(raw))

/**
 * `requested` equals `registered` byte for byte, or — for an `http:` loopback registration — differs
 * only in the port (RFC 8252 §7.3: native apps pick an ephemeral port). Both must be acceptable.
 */
export const redirectMatches = (registered: string, requested: string): boolean =>
  isAcceptableRedirectUri(requested) &&
  (registered === requested ||
    Option.exists(
      Option.all([parseUrl(registered), parseUrl(requested)]),
      ([a, b]) =>
        a.protocol === "http:" &&
        isLoopbackRedirect(registered) &&
        b.protocol === a.protocol &&
        b.hostname === a.hostname &&
        b.pathname === a.pathname &&
        b.search === a.search,
    ))

/** Why an authorization request was refused; `redirect` is Some once the redirect URI is trusted. */
export interface AuthorizationRefusal {
  readonly code: string
  readonly message: string
  readonly redirect: Option.Option<string>
}

const refuse = (code: string, message: string, redirect: Option.Option<string> = Option.none()) =>
  Option.some<AuthorizationRefusal>({ code, message, redirect })

/**
 * Checks the query against the resolved client: `redirect_uri` must equal one of its URIs (or be
 * omitted when it has exactly one); only after that are errors redirected back to the client.
 * PKCE S256 is required, and `resource`, when sent, must be the MCP resource.
 */
export const parseAuthorization = (
  url: URL,
  client: ResolvedClient,
  resource: string,
): {
  readonly refusal: Option.Option<AuthorizationRefusal>
  readonly request: AuthorizationRequest
} => {
  const param = (name: string) => Option.fromNullishOr(url.searchParams.get(name))
  const requested = param("redirect_uri")
  // OAuth 2.1: `redirect_uri` is required, so `/oauth/token`'s equality check always has a value.
  const redirectUri = Option.filter(requested, (uri) =>
    client.redirectUris.some((registered) => redirectMatches(registered, uri)),
  )
  const state = Option.getOrElse(param("state"), () => "")
  const scope = Option.getOrElse(param("scope"), () => "")
    .split(" ")
    .filter((part) => part.length > 0)
  const codeChallenge = param("code_challenge")
  const method = param("code_challenge_method")
  const requestedResource = param("resource")
  const request: AuthorizationRequest = {
    responseType: Option.getOrElse(param("response_type"), () => ""),
    clientId: client.clientId,
    redirectUri: Option.getOrElse(redirectUri, () => ""),
    scope,
    state,
    ...Option.match(codeChallenge, { onNone: () => ({}), onSome: (c) => ({ codeChallenge: c }) }),
    ...Option.match(method, { onNone: () => ({}), onSome: (m) => ({ codeChallengeMethod: m }) }),
    ...Option.match(requestedResource, { onNone: () => ({}), onSome: (r) => ({ resource: r }) }),
  }
  if (Option.isNone(redirectUri)) {
    return { request, refusal: refuse("invalid_request", "Invalid redirect URI") }
  }
  const back = (error: string) => Option.some(withQuery(redirectUri.value, { error, state }))
  const refusal =
    request.responseType !== "code"
      ? refuse(
          "unsupported_response_type",
          "Unsupported response type",
          back("unsupported_response_type"),
        )
      : !Option.exists(method, (m) => m === "S256") ||
          !Option.exists(codeChallenge, (c) => PKCE_CHALLENGE.test(c))
        ? refuse("invalid_request", "PKCE S256 is required", back("invalid_request"))
        : Option.exists(requestedResource, (r) => r !== resource)
          ? refuse("invalid_target", "Unknown resource", back("invalid_target"))
          : Option.none()
  return { request, refusal }
}
