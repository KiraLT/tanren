import { env } from "cloudflare:workers"
import { Layer } from "effect"
import { d1Persistence, makeApp } from "./app"
import { BetterAuth } from "./auth/BetterAuth"
import { EmailSender } from "./auth/EmailSender"
import { WorkerConfig } from "./Config"
import type { Env } from "./Env"
import { ExportQueue } from "./integrations/ExportQueue"
import { runScheduled } from "./integrations/scheduled"
import { McpAuth } from "./mcp/McpAuth"
import { makeMcp } from "./mcp/McpRoute"
import { makeAuthorize } from "./oauth/authorize"
import { makeRouter, statelessOAuth } from "./oauth/provider"

/**
 * Built once per isolate. Module scope only describes layers and decodes the vars (no I/O): the D1
 * binding is captured here but queried per request. Everything lives in `env.DB`: auth tables
 * (migration 0001), domain rows, token generations and the OAuth code ledger (0006). OAuth itself is
 * stateless (ADR-0022): codes, consent handles, client ids and tokens are signed JWTs.
 */
const config = WorkerConfig.fromEnvSync(env)
const persistence = d1Persistence(env.DB)

const betterAuth = BetterAuth.layer(env.DB).pipe(Layer.provide(EmailSender.layer))

const app = makeApp(env, {
  auth: { _tag: "BetterAuth", betterAuth },
  persistence,
  exports: ExportQueue.layerD1(env.DB),
})

/** The MCP server (docs/design/mcp.md, auth-v2.md §1): an MCP access JWT, or the local dev token. */
const mcp = makeMcp(env, { persistence, auth: McpAuth.layerLive })

/** The authorize pages (oauth.md §3) over the stateless OAuth port; a second lazy Better Auth. */
const authorize = makeAuthorize(env, { betterAuth, oauth: statelessOAuth(persistence) })

const router = makeRouter(env, config, { app, mcp, authorize }, persistence)

/**
 * `fetch` = the router (OAuth endpoints, `/mcp`, authorize pages, REST app).
 * `scheduled` = the cron export drain (design §6), kept alive with `waitUntil`.
 */
export default {
  fetch: (request: Request, workerEnv: Env, ctx: ExecutionContext) =>
    router.fetch(request, workerEnv, ctx),
  scheduled: (_controller: ScheduledController, workerEnv: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(runScheduled(workerEnv))
  },
}
