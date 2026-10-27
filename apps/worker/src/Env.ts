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
  /** Absolute URL of the MCP resource, e.g. `https://mcp.tanren.me/mcp` (`http:` only locally). */
  readonly MCP_RESOURCE_URL: string
  /**
   * Comma-separated URL prefixes the native sign-in may hand a code to (`returnTo.startsWith(prefix)`
   * plus the `RETURN_TO` shape). Unset: `exp://localhost:,exp://127.0.0.1:` when local, none
   * elsewhere. `dev:phone` adds `exp://<LAN IP>:` via `--var`; production is
   * `exps://u.expo.dev/<projectId>/` (owner value, docs/design/deploy.md). `tanren://` only if listed.
   */
  readonly NATIVE_RETURN_PREFIXES?: string
  /** `console` (local only: logs instead of calling Strava) or `provider`. */
  readonly STRAVA_MODE: string
  /** Public Strava app id (var). */
  readonly STRAVA_CLIENT_ID: string
  /**
   * Local simulation only: `inactive` makes the console `createActivity` fail like a Strava app whose
   * subscription lapsed. Refused unless `STRAVA_MODE` is `console`; pass it with `--var`, never in config.
   */
  readonly STRAVA_CONSOLE_FAIL?: string
  /** Secret, required when `STRAVA_MODE` is `provider` (`wrangler secret put STRAVA_CLIENT_SECRET --env production`). */
  readonly STRAVA_CLIENT_SECRET?: string
  /**
   * Secret: base64 of 32 random bytes (`openssl rand -base64 32`), the AES-256-GCM key that seals
   * integration tokens. A clearly fake key is a local var; outside `local` it is always a secret.
   */
  readonly INTEGRATION_TOKEN_KEY: string
  /** `console` (default when absent: fixture data, no network) or `provider` (Garmin Personal API). */
  readonly GARMIN_MODE?: string
  /** Garmin Personal API origin (var); absent = `https://personal.connectapi.garmin.com`. */
  readonly GARMIN_BASE_URL?: string
  /**
   * Local simulation only: `rejected` makes the console `exchange` fail like a revoked key. Refused
   * unless `GARMIN_MODE` is `console`; pass it with `--var`, never in config.
   */
  readonly GARMIN_CONSOLE_FAIL?: string
}

/** The plain vars `WorkerConfig` needs, so tests can build a config without D1. */
export type EnvVars = Omit<Env, "DB">
