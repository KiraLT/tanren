import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider"

/**
 * Worker bindings and vars as Cloudflare hands them over: raw strings, not yet validated.
 * `WorkerConfig.layerFromEnv` decodes the vars; nothing else reads them directly.
 */
export interface Env {
  readonly DB: D1Database
  readonly ENVIRONMENT: string
  readonly BETTER_AUTH_URL: string
  readonly BETTER_AUTH_SECRET: string
  /** Comma-separated origins. */
  readonly ALLOWED_ORIGINS: string
  readonly EMAIL_MODE: string
  /** Magic-link sender address (var), e.g. `Tanren <login@tanren.me>`. */
  readonly EMAIL_FROM: string
  /** Secret, required when `EMAIL_MODE` is `provider` (Resend API key). */
  readonly RESEND_API_KEY?: string
  /** Local only: bearer token for the dev MCP route. Must be absent outside `local`. */
  readonly DEV_MCP_TOKEN?: string
  /** KV namespace the OAuth provider stores clients, grants and tokens in. */
  readonly OAUTH_KV: KVNamespace
  /** Absolute URL of the MCP resource, e.g. `https://mcp.tanren.me/mcp` (`http:` only locally). */
  readonly MCP_RESOURCE_URL: string
  /**
   * Comma-separated URL prefixes the native sign-in may hand a code to (`returnTo.startsWith(prefix)`
   * plus the `RETURN_TO` shape). Unset: `exp://localhost:,exp://127.0.0.1:` when local, none
   * elsewhere. `dev:phone` adds `exp://<LAN IP>:` via `--var`; production is
   * `exps://u.expo.dev/<projectId>/` (owner value, docs/design/deploy.md). `tanren://` only if listed.
   */
  readonly NATIVE_RETURN_PREFIXES?: string
  /** Injected per request by `OAuthProvider`; absent in the module-scope `env`. */
  readonly OAUTH_PROVIDER?: OAuthHelpers
}

/**
 * The plain vars `WorkerConfig` needs, so tests can build a config without D1, KV or the
 * provider helpers.
 */
export type EnvVars = Omit<Env, "DB" | "OAUTH_KV" | "OAUTH_PROVIDER">
