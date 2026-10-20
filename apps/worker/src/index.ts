import { env } from "cloudflare:workers"
import { Layer } from "effect"
import { d1Persistence, makeApp } from "./app"
import { BetterAuth } from "./auth/BetterAuth"
import { EmailSender } from "./auth/EmailSender"
import { McpAuth } from "./mcp/McpAuth"
import { makeMcp } from "./mcp/McpRoute"

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

/** The MCP server (docs/design/mcp.md): same D1, dev-token auth until step 5 adds OAuth. */
const mcp = makeMcp(env, { persistence: d1Persistence(env.DB), auth: McpAuth.layerDevToken })

/** `/mcp` (exact path) is routed before the REST app. */
export default {
  fetch: (request: Request, workerEnv: unknown, ctx: ExecutionContext): Promise<Response> =>
    new URL(request.url).pathname === "/mcp"
      ? mcp.handle(request, workerEnv, ctx)
      : app.handler(request),
}
