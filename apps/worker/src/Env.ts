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
  /** Local only: bearer token for the dev MCP route. Must be absent outside `local`. */
  readonly DEV_MCP_TOKEN?: string
}

/** The vars `WorkerConfig` needs, so tests can build a config without a D1 binding. */
export type EnvVars = Omit<Env, "DB">
