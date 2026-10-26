import { Context, Data, Effect, Layer, Option, Redacted, Result, Schema } from "effect"
import { Base64 } from "effect/encoding"

/** Startup failure: the env is incomplete or unsafe. Internal; the Worker refuses to serve. */
export class ConfigError extends Data.TaggedError("ConfigError")<{
  readonly message: string
}> {}

export const Environment = Schema.Literals(["local", "preview", "production"])
export type Environment = typeof Environment.Type

export const EmailMode = Schema.Literals(["console", "provider"])
export type EmailMode = typeof EmailMode.Type

export const StravaMode = Schema.Literals(["console", "provider"])
export type StravaMode = typeof StravaMode.Type

/** 32 zero bytes, base64. The local `wrangler.jsonc` value; refused outside `local` (docs/design/integrations.md §3). */
export const FAKE_INTEGRATION_TOKEN_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="

/** `INTEGRATION_TOKEN_KEY` must be base64 for exactly 32 bytes (AES-256). */
const isAes256KeyBase64 = (raw: string): boolean =>
  Result.match(Base64.decode(raw), {
    onFailure: () => false,
    onSuccess: (bytes) => bytes.length === 32,
  })

/** The raw vars wrangler injects (docs/design/local-dev.md §2). Extra keys such as `DB` are ignored. */
const RawEnv = Schema.Struct({
  ENVIRONMENT: Environment,
  BETTER_AUTH_URL: Schema.NonEmptyString,
  BETTER_AUTH_SECRET: Schema.RedactedFromValue(Schema.NonEmptyString),
  ALLOWED_ORIGINS: Schema.String,
  EMAIL_MODE: EmailMode,
  EMAIL_FROM: Schema.NonEmptyString,
  RESEND_API_KEY: Schema.optionalKey(Schema.RedactedFromValue(Schema.NonEmptyString)),
  DEV_MCP_TOKEN: Schema.optionalKey(Schema.RedactedFromValue(Schema.NonEmptyString)),
  MCP_RESOURCE_URL: Schema.NonEmptyString,
  NATIVE_RETURN_PREFIXES: Schema.optionalKey(Schema.String),
  STRAVA_MODE: StravaMode,
  STRAVA_CLIENT_ID: Schema.NonEmptyString,
  STRAVA_CONSOLE_FAIL: Schema.optionalKey(Schema.String),
  STRAVA_CLIENT_SECRET: Schema.optionalKey(Schema.RedactedFromValue(Schema.NonEmptyString)),
  INTEGRATION_TOKEN_KEY: Schema.RedactedFromValue(Schema.NonEmptyString),
})

/** Without `NATIVE_RETURN_PREFIXES`: the simulator / USB Expo Go locally, nothing elsewhere. */
const defaultNativeReturnPrefixes = (environment: Environment): ReadonlyArray<string> =>
  environment === "local" ? ["exp://localhost:", "exp://127.0.0.1:"] : []

export interface WorkerConfigShape {
  readonly environment: Environment
  readonly betterAuthUrl: string
  readonly betterAuthSecret: Redacted.Redacted<string>
  readonly allowedOrigins: ReadonlyArray<string>
  readonly emailMode: EmailMode
  /** Sender for magic links, e.g. `Tanren <login@tanren.me>` (a Resend-verified domain in production). */
  readonly emailFrom: string
  /** Required when `emailMode` is `provider` (startup guard). */
  readonly resendApiKey: Option.Option<Redacted.Redacted<string>>
  readonly devMcpToken: Option.Option<Redacted.Redacted<string>>
  /** Absolute URL of the MCP resource (`https:`; `http:` only when `environment` is `local`). */
  readonly mcpResourceUrl: string
  /**
   * URL prefixes a native sign-in code may be sent to (`exp://192.168.1.5:`,
   * `exps://u.expo.dev/<projectId>/`, `tanren://`); a host alone is not enough, since every EAS
   * project shares `u.expo.dev`.
   */
  readonly nativeReturnPrefixes: ReadonlyArray<string>
  /** `console` logs instead of calling Strava; only allowed when `environment` is `local` (startup guard). */
  readonly stravaMode: StravaMode
  /** Simulates an inactive Strava app in console mode (`STRAVA_CONSOLE_FAIL=inactive`, startup guard). */
  readonly stravaConsoleFail: Option.Option<"inactive">
  /** Public Strava app id (a var). */
  readonly stravaClientId: string
  /** Required when `stravaMode` is `provider` (startup guard). */
  readonly stravaClientSecret: Option.Option<Redacted.Redacted<string>>
  /** AES-256-GCM key for sealing integration tokens: base64 of 32 bytes (`TokenSeal`). */
  readonly integrationTokenKey: Redacted.Redacted<string>
}

const splitOrigins = (raw: string): ReadonlyArray<string> =>
  raw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)

/** `MCP_RESOURCE_URL` must be an absolute URL without a fragment; `http:` only for `local`. */
const checkResourceUrl = (
  raw: string,
  environment: Environment,
): Effect.Effect<string, ConfigError> =>
  Effect.try({
    try: () => new URL(raw),
    catch: () => new ConfigError({ message: `MCP_RESOURCE_URL "${raw}" is not an absolute URL` }),
  }).pipe(
    Effect.flatMap((url) => {
      if (raw.includes("#")) {
        return Effect.fail(
          new ConfigError({ message: `MCP_RESOURCE_URL "${raw}" must not have a fragment` }),
        )
      }
      if (url.protocol === "https:" || (url.protocol === "http:" && environment === "local")) {
        return Effect.succeed(raw)
      }
      return Effect.fail(
        new ConfigError({
          message: `MCP_RESOURCE_URL "${raw}" must use https: (http: is only allowed when ENVIRONMENT is "local", got "${environment}")`,
        }),
      )
    }),
  )

/**
 * Decodes the Worker env. `env` is `unknown` because it is a boundary: pass the `Env` binding
 * object. Fails with `ConfigError` for missing or malformed vars and for the guard in
 * docs/design/local-dev.md §2: outside `local`, console email or a dev MCP token is refused;
 * provider email without `RESEND_API_KEY` is refused everywhere; `MCP_RESOURCE_URL` must be an
 * absolute https: URL (http: only locally).
 */
const decodeEnv = (env: unknown): Effect.Effect<WorkerConfigShape, ConfigError> =>
  Effect.gen(function* () {
    const raw = yield* Schema.decodeUnknownEffect(RawEnv)(env).pipe(
      Effect.mapError((error) => new ConfigError({ message: error.message })),
    )
    const devMcpToken = Option.fromNullishOr(raw.DEV_MCP_TOKEN)
    const resendApiKey = Option.fromNullishOr(raw.RESEND_API_KEY)
    if (raw.EMAIL_MODE === "provider" && Option.isNone(resendApiKey)) {
      return yield* new ConfigError({
        message: `EMAIL_MODE "provider" needs the RESEND_API_KEY secret`,
      })
    }
    if (raw.ENVIRONMENT !== "local" && raw.EMAIL_MODE === "console") {
      return yield* new ConfigError({
        message: `EMAIL_MODE "console" is only allowed when ENVIRONMENT is "local" (got "${raw.ENVIRONMENT}")`,
      })
    }
    if (raw.ENVIRONMENT !== "local" && Option.isSome(devMcpToken)) {
      return yield* new ConfigError({
        message: `DEV_MCP_TOKEN must not be set when ENVIRONMENT is "${raw.ENVIRONMENT}"`,
      })
    }
    const stravaClientSecret = Option.fromNullishOr(raw.STRAVA_CLIENT_SECRET)
    if (raw.STRAVA_MODE === "provider" && Option.isNone(stravaClientSecret)) {
      return yield* new ConfigError({
        message: `STRAVA_MODE "provider" needs the STRAVA_CLIENT_SECRET secret`,
      })
    }
    if (raw.ENVIRONMENT !== "local" && raw.STRAVA_MODE === "console") {
      return yield* new ConfigError({
        message: `STRAVA_MODE "console" is only allowed when ENVIRONMENT is "local" (got "${raw.ENVIRONMENT}")`,
      })
    }
    const stravaConsoleFail = yield* Option.match(Option.fromNullishOr(raw.STRAVA_CONSOLE_FAIL), {
      onNone: () => Effect.succeed(Option.none<"inactive">()),
      onSome: (value) =>
        value !== "inactive"
          ? Effect.fail(
              new ConfigError({
                message: `STRAVA_CONSOLE_FAIL "${value}" is not supported (only "inactive")`,
              }),
            )
          : raw.STRAVA_MODE === "console"
            ? Effect.succeed(Option.some("inactive" as const))
            : Effect.fail(
                new ConfigError({
                  message: `STRAVA_CONSOLE_FAIL is only allowed when STRAVA_MODE is "console" (got "${raw.STRAVA_MODE}")`,
                }),
              ),
    })
    const tokenKey = Redacted.value(raw.INTEGRATION_TOKEN_KEY)
    if (!isAes256KeyBase64(tokenKey)) {
      return yield* new ConfigError({
        message:
          "INTEGRATION_TOKEN_KEY must be base64 for exactly 32 bytes (openssl rand -base64 32)",
      })
    }
    if (raw.ENVIRONMENT !== "local" && tokenKey === FAKE_INTEGRATION_TOKEN_KEY) {
      return yield* new ConfigError({
        message: `INTEGRATION_TOKEN_KEY is the local fake key; it is only allowed when ENVIRONMENT is "local" (got "${raw.ENVIRONMENT}")`,
      })
    }
    const mcpResourceUrl = yield* checkResourceUrl(raw.MCP_RESOURCE_URL, raw.ENVIRONMENT)
    return {
      environment: raw.ENVIRONMENT,
      betterAuthUrl: raw.BETTER_AUTH_URL,
      betterAuthSecret: raw.BETTER_AUTH_SECRET,
      allowedOrigins: splitOrigins(raw.ALLOWED_ORIGINS),
      emailMode: raw.EMAIL_MODE,
      emailFrom: raw.EMAIL_FROM,
      resendApiKey,
      devMcpToken,
      mcpResourceUrl,
      nativeReturnPrefixes: Option.match(Option.fromNullishOr(raw.NATIVE_RETURN_PREFIXES), {
        onNone: () => defaultNativeReturnPrefixes(raw.ENVIRONMENT),
        onSome: splitOrigins,
      }),
      stravaMode: raw.STRAVA_MODE,
      stravaConsoleFail,
      stravaClientId: raw.STRAVA_CLIENT_ID,
      stravaClientSecret,
      integrationTokenKey: raw.INTEGRATION_TOKEN_KEY,
    }
  })

export class WorkerConfig extends Context.Service<WorkerConfig, WorkerConfigShape>()(
  "@tanren/worker/WorkerConfig",
) {
  /** Layer over the decode in `decodeEnv`; a `ConfigError` fails the layer. */
  static readonly layerFromEnv = (env: unknown): Layer.Layer<WorkerConfig, ConfigError> =>
    Layer.effect(WorkerConfig, decodeEnv(env))

  /**
   * The same decode, run synchronously for module scope (the `OAuthProvider` is built there). It
   * does no I/O; a `ConfigError` becomes a defect, i.e. a startup failure like the eager layers.
   */
  static readonly fromEnvSync = (env: unknown): WorkerConfigShape => Effect.runSync(decodeEnv(env))
}
