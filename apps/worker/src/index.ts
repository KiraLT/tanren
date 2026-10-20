import { env } from "cloudflare:workers"
import { Layer } from "effect"
import { d1Persistence, makeApp } from "./app"
import { BetterAuth } from "./auth/BetterAuth"
import { EmailSender } from "./auth/EmailSender"
import { WorkerConfig } from "./Config"
import { McpAuth } from "./mcp/McpAuth"
import { makeMcp } from "./mcp/McpRoute"
import { makeAuthorize } from "./oauth/authorize"
import { makeProvider } from "./oauth/provider"

/**
 * Built once per isolate. Module scope only describes layers and decodes the vars (no I/O): the D1
 * binding is captured here but queried per request. Auth tables (migration 0001) and domain rows
 * both live in `env.DB`; OAuth grants and tokens live in `env.OAUTH_KV` (the provider's).
 */
const config = WorkerConfig.fromEnvSync(env)

const betterAuth = BetterAuth.layer(env.DB).pipe(Layer.provide(EmailSender.layer))

const app = makeApp(env, {
  auth: { _tag: "BetterAuth", betterAuth },
  persistence: d1Persistence(env.DB),
})

/** The MCP server (docs/design/mcp.md, oauth.md §4): OAuth props, or the local dev token. */
const mcp = makeMcp(env, { persistence: d1Persistence(env.DB), auth: McpAuth.layerLive })

/** The authorize pages (oauth.md §3); a second lazy Better Auth instance on the same DB. */
const authorize = makeAuthorize(env, { betterAuth })

export default makeProvider(config, { app, mcp, authorize })
