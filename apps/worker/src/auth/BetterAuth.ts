import { type BetterAuthOptions, betterAuth } from "better-auth"
import { magicLink } from "better-auth/plugins"
import { Context, Effect, Layer, Option, Redacted } from "effect"
import { type Environment, WorkerConfig, type WorkerConfigShape } from "../Config"
import { EmailSender, type EmailSenderShape } from "./EmailSender"

/** Seed user of docs/design/local-dev.md §1: signing in as this email locally reuses its id. */
export const DEV_USER_EMAIL = "dev@tanren.local"
export const DEV_USER_ID = "00000000-0000-4000-8000-000000000001"

/** What Better Auth accepts as `database`: the D1 binding once the auth tables are migrated. */
export type AuthDatabase = NonNullable<BetterAuthOptions["database"]>

/** The id a new user must get instead of a random UUID, if any. */
export const seedUserId = (environment: Environment, email: string): Option.Option<string> =>
  environment === "local" && email.toLowerCase() === DEV_USER_EMAIL
    ? Option.some(DEV_USER_ID)
    : Option.none()

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
    advanced: { database: { generateId: "uuid" } },
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
