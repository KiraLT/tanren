import { MCP_SCOPES, type McpScope, OAuthProps, type UserId } from "@tanren/shared"
import { Array as Arr, Context, Effect, Layer, Option, Redacted, Schema } from "effect"
import { DEV_USER_ID } from "../auth/devUser"
import { WorkerConfig, type WorkerConfigShape } from "../Config"

/** The authenticated caller of `/mcp` (docs/design/oauth.md §4). */
export interface McpPrincipal {
  readonly userId: UserId
  readonly scopes: ReadonlyArray<McpScope>
}

/**
 * Who is calling the MCP endpoint (docs/design/mcp.md §2, oauth.md §4). `layerDevToken` knows the
 * local dev token, `layerOAuth` reads `ctx.props`, `layerLive` tries both. Never reads cookies and never depends on
 * `Sessions`/Better Auth.
 */
export interface McpAuthShape {
  /** `Some(principal)` for an authenticated request, `None` otherwise (the route answers 401). */
  readonly resolve: (
    request: Request,
    ctx: ExecutionContext,
  ) => Effect.Effect<Option.Option<McpPrincipal>>
}

/**
 * The 401 challenge for `/mcp`, byte-identical to the `OAuthProvider`'s own (RFC 9728 §5.1;
 * `buildWwwAuthenticateHeader`: realm, resource_metadata, then the provider's `requiredScopes`,
 * which are every MCP scope so clients ask for write too; a read-only token is still accepted).
 */
export const challenge = (mcpResourceUrl: string): string => {
  const resource = new URL(mcpResourceUrl)
  const suffix = resource.pathname === "/" ? "" : resource.pathname
  const metadata = `${resource.origin}/.well-known/oauth-protected-resource${suffix}`
  return `Bearer realm="OAuth", resource_metadata="${metadata}", scope="${MCP_SCOPES.join(" ")}"`
}

/** The dev-token caller: the seed user with every scope. */
export const DEV_PRINCIPAL: McpPrincipal = { userId: DEV_USER_ID, scopes: MCP_SCOPES }

/** The token of an `Authorization: Bearer <token>` header; the scheme is case-insensitive (RFC 7235). */
const bearerToken = (request: Request): Option.Option<string> =>
  Option.fromNullishOr(request.headers.get("Authorization")).pipe(
    Option.flatMap((header) => Option.fromNullishOr(/^Bearer +(\S+)\s*$/i.exec(header)?.[1])),
  )

const encoder = new TextEncoder()

/**
 * Compares every byte of the longer input, without an early exit, so the time taken does not
 * reveal how long a matching prefix is.
 */
export const constantTimeEqual = (left: string, right: string): boolean => {
  const a = encoder.encode(left)
  const b = encoder.encode(right)
  const length = Math.max(a.length, b.length)
  const diff = Arr.reduce(
    Arr.makeBy(length, (i) => i),
    a.length ^ b.length,
    (acc, i) => acc | ((a[i] ?? 0) ^ (b[i] ?? 0)),
  )
  return diff === 0
}

/**
 * `token` is the configured `DEV_MCP_TOKEN` and `environment === "local"` → the dev principal.
 * Shared by `layerDevToken` and the provider's `resolveExternalToken` in `index.ts`.
 */
export const devPrincipalFor = (
  config: Pick<WorkerConfigShape, "environment" | "devMcpToken">,
  token: string,
): Option.Option<McpPrincipal> =>
  config.environment !== "local"
    ? Option.none()
    : Option.flatMap(config.devMcpToken, (expected) =>
        constantTimeEqual(token, Redacted.value(expected))
          ? Option.some(DEV_PRINCIPAL)
          : Option.none(),
      )

const decodeProps = Schema.decodeUnknownOption(OAuthProps)

/** `ctx.props` as the provider sets it for a valid token (the grant's `OAuthProps`), else none. */
export const principalFromProps = (props: unknown): Option.Option<McpPrincipal> =>
  decodeProps(props)

export class McpAuth extends Context.Service<McpAuth, McpAuthShape>()("@tanren/worker/McpAuth") {
  /**
   * `Bearer <DEV_MCP_TOKEN>` → the seed user with all scopes, and only when
   * `environment === "local"`. Anything else (no token configured, wrong or missing header,
   * another environment) → `None`. Ignores `ctx`.
   */
  static readonly layerDevToken: Layer.Layer<McpAuth, never, WorkerConfig> = Layer.effect(
    this,
    Effect.gen(function* () {
      const config = yield* WorkerConfig
      const resolve = (request: Request): Effect.Effect<Option.Option<McpPrincipal>> =>
        Effect.sync(() =>
          Option.flatMap(bearerToken(request), (token) => devPrincipalFor(config, token)),
        )
      return { resolve }
    }),
  )

  /**
   * OAuth (step 5): the `OAuthProvider` validated the bearer and put the grant's props in
   * `ctx.props`; anything that does not decode as `OAuthProps` → `None`. Ignores the request.
   */
  static readonly layerOAuth: Layer.Layer<McpAuth> = Layer.succeed(
    this,
    this.of({ resolve: (_request, ctx) => Effect.sync(() => principalFromProps(ctx.props)) }),
  )

  /** The Worker: OAuth props first, then the local dev token. */
  static readonly layerLive: Layer.Layer<McpAuth, never, WorkerConfig> = Layer.effect(
    this,
    Effect.gen(function* () {
      const oauth = yield* McpAuth.pipe(Effect.provide(McpAuth.layerOAuth))
      const dev = yield* McpAuth.pipe(Effect.provide(McpAuth.layerDevToken))
      return McpAuth.of({
        resolve: (request, ctx) =>
          oauth.resolve(request, ctx).pipe(
            Effect.flatMap(
              Option.match({
                onSome: (principal) => Effect.succeed(Option.some(principal)),
                onNone: () => dev.resolve(request, ctx),
              }),
            ),
          ),
      })
    }),
  )

  /** Tests: every request resolves to `principal`. */
  static readonly layerFixed = (principal: Option.Option<McpPrincipal>): Layer.Layer<McpAuth> =>
    Layer.succeed(this, this.of({ resolve: () => Effect.succeed(principal) }))
}
