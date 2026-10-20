import { env } from "cloudflare:workers"
import { Layer } from "effect"
import { d1Persistence, makeApp } from "./app"
import { BetterAuth } from "./auth/BetterAuth"
import { EmailSender } from "./auth/EmailSender"

/**
 * Built once per isolate. Module scope only describes layers: the D1 binding is captured here but
 * queried per request. Auth tables (migration 0001) and domain rows both live in `env.DB`.
 * `makeApp` provides `WorkerConfig.layerFromEnv(env)` to the auth layer.
 */
const app = makeApp(env, {
  auth: {
    _tag: "BetterAuth",
    betterAuth: BetterAuth.layer(env.DB).pipe(Layer.provide(EmailSender.layer)),
  },
  persistence: d1Persistence(env.DB),
})

export default { fetch: (request: Request): Promise<Response> => app.handler(request) }
