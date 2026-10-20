import { type BetterAuthOptions, betterAuth } from "better-auth"
import { bearer, magicLink, oneTimeToken } from "better-auth/plugins"
import { Context, Effect, Layer, Option, Redacted } from "effect"
import { type Environment, WorkerConfig, type WorkerConfigShape } from "../Config"
import { DEV_USER_EMAIL, DEV_USER_ID } from "./devUser"
import { EmailSender, type EmailSenderShape } from "./EmailSender"

export { DEV_USER_EMAIL, DEV_USER_ID } from "./devUser"

/** What Better Auth accepts as `database`: the D1 binding once the auth tables are migrated. */
export type AuthDatabase = NonNullable<BetterAuthOptions["database"]>

/** The id a new user must get instead of a random UUID, if any. */
export const seedUserId = (environment: Environment, email: string): Option.Option<string> =>
  environment === "local" && email.toLowerCase() === DEV_USER_EMAIL
    ? Option.some(DEV_USER_ID)
    : Option.none()

/**
 * Better Auth turns its limiter on only when `NODE_ENV === "production"`, which the deployed Worker
 * never sets (`dist/context/create-context.mjs:172`: `enabled ?? isProduction`). Production is
 * therefore explicit, from our `ENVIRONMENT`; elsewhere Better Auth's default stays (off, unless a
 * test stubs `NODE_ENV`, as `rateLimit.workerd.test.ts` does).
 */
export const rateLimitFor = (
  environment: Environment,
): NonNullable<BetterAuthOptions["rateLimit"]> =>
  environment === "production" ? { enabled: true } : {}

const makeAuth = (
  config: WorkerConfigShape,
  sender: EmailSenderShape,
  context: Context.Context<never>,
  database: Option.Option<AuthDatabase>,
) =>
  betterAuth({
    // No `database` → Better Auth's built-in memory adapter, fresh per instance. Do not import
    // `better-auth/adapters/memory` instead: its `export *` re-export breaks under wrangler's
    // esbuild bundle (the module is lazily initialised for Better Auth's own dynamic import, and
    // the static re-export never runs its init), so `memoryAdapter` is undefined in workerd.
    ...Option.match(database, { onNone: () => ({}), onSome: (db) => ({ database: db }) }),
    baseURL: config.betterAuthUrl,
    basePath: "/api/auth",
    secret: Redacted.value(config.betterAuthSecret),
    trustedOrigins: [...config.allowedOrigins],
    // Server-only: the bare one-time token must never be redeemable over HTTP; the native exchange
    // (`POST /api/native/session`, binding checked first) is the only door. Entries are relative to
    // `basePath` (`normalizePathname`), and `auth.api.*` calls bypass the list.
    disabledPaths: ["/one-time-token/generate", "/one-time-token/verify"],
    rateLimit: rateLimitFor(config.environment),
    advanced: {
      database: { generateId: "uuid" },
      // The rate limiter keys on the first of these headers that holds a valid IP (default
      // `x-forwarded-for`, which a caller sets freely). Cloudflare overwrites `cf-connecting-ip`.
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
    // A non-API error (a rejected `sendMagicLink`, a D1 failure) rejects `auth.handler` instead of
    // becoming Better Auth's empty 500, so `authRoutes` can answer 502 / 503. API errors (4xx,
    // redirects) are still turned into responses by the router (better-call `router.mjs`).
    onAPIError: { throw: true },
    databaseHooks: {
      user: {
        create: {
          before: (user) =>
            Promise.resolve(
              Option.match(seedUserId(config.environment, user.email), {
                onNone: () => undefined,
                onSome: (id) => ({ data: { ...user, id } }),
              }),
            ),
        },
      },
    },
    plugins: [
      magicLink({
        // Adapter edge: Better Auth wants a Promise. A send failure rejects it, so the
        // sign-in request fails instead of pretending an email went out.
        sendMagicLink: ({ email, url }) =>
          Effect.runPromiseWith(context)(sender.send({ email, url })),
      }),
      // `Authorization: Bearer <session.token>` → the session cookie, also for
      // `auth.api.getSession({ headers })` (SessionsLive), so the native app needs no cookie.
      bearer(),
      // The native code's one-time half: single use, 5 min, stored hashed in `verification`.
      // Generated and consumed only through `auth.api.*` (see `disabledPaths`).
      oneTimeToken({
        expiresIn: 5,
        disableClientRequest: true,
        disableSetSessionCookie: true,
        storeToken: "hashed",
      }),
    ],
  })

export type Auth = ReturnType<typeof makeAuth>

export interface BetterAuthShape {
  /**
   * The instance, created on first use and then shared. Lazy on purpose: `betterAuth()` starts a
   * schema check against the database the moment it is called, and the Worker builds its layers at
   * module scope, where workerd forbids I/O (the check failed and logged at isolate start). First
   * use is inside a request, so the check runs there.
   */
  readonly auth: Effect.Effect<Auth>
}

/** One Better Auth instance per layer build (once per isolate in the Worker), made on first use. */
export class BetterAuth extends Context.Service<BetterAuth, BetterAuthShape>()(
  "@tanren/worker/BetterAuth",
) {
  static readonly layerFor = (
    database: Option.Option<AuthDatabase>,
  ): Layer.Layer<BetterAuth, never, WorkerConfig | EmailSender> =>
    Layer.effect(
      BetterAuth,
      Effect.gen(function* () {
        const config = yield* WorkerConfig
        const sender = yield* EmailSender
        const context = yield* Effect.context<never>()
        const auth = yield* Effect.cached(
          Effect.sync(() => makeAuth(config, sender, context, database)),
        )
        return BetterAuth.of({ auth })
      }),
    )

  /** `database`: pass `env.DB` once the auth tables are migrated. */
  static readonly layer = (
    database: AuthDatabase,
  ): Layer.Layer<BetterAuth, never, WorkerConfig | EmailSender> =>
    BetterAuth.layerFor(Option.some(database))

  /** In-memory auth tables, fresh per layer build. Used until the auth tables exist in D1. */
  static readonly layerMemory: Layer.Layer<BetterAuth, never, WorkerConfig | EmailSender> =
    BetterAuth.layerFor(Option.none())
}
