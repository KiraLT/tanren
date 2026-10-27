import type { UserTokens } from "@tanren/db"
import { IdGenerator } from "@tanren/shared"
import { createMcpHandler } from "agents/mcp/server"
import { Effect, Layer, ManagedRuntime, Option } from "effect"
import type { Persistence } from "../app"
import { WorkerConfig } from "../Config"
import { challenge, McpAuth } from "./McpAuth"
import { createServer } from "./server"

// The `/mcp` route (docs/design/mcp.md §1–§2): authenticate, then hand the request to the
// stateless SDK handler with a per-request `McpServer` that knows the caller by closure.

export interface McpServices {
  readonly persistence: Layer.Layer<Persistence>
  /** May need `UserTokens` (the write check, STLS-F4): it is served from `persistence`. */
  readonly auth: Layer.Layer<McpAuth, never, WorkerConfig | UserTokens>
}

export interface Mcp {
  readonly handle: (request: Request, env: unknown, ctx: ExecutionContext) => Promise<Response>
  readonly dispose: () => Promise<void>
}

const unauthorized = (mcpResourceUrl: string): Response =>
  new Response(null, { status: 401, headers: { "WWW-Authenticate": challenge(mcpResourceUrl) } })

/**
 * One runtime per isolate. `ManagedRuntime.make` only describes it: the layers are built on the
 * first request, so calling `makeMcp` at module scope starts no I/O.
 */
export const makeMcp = (env: unknown, services: McpServices): Mcp => {
  const runtime = ManagedRuntime.make(
    Layer.mergeAll(
      services.persistence,
      IdGenerator.layer,
      // Same `persistence` reference: memoised, one instance per runtime.
      services.auth.pipe(Layer.provide(services.persistence)),
    ).pipe(Layer.provideMerge(WorkerConfig.layerFromEnv(env))),
  )
  const handle = (request: Request, workerEnv: unknown, ctx: ExecutionContext) =>
    runtime.runPromise(
      Effect.gen(function* () {
        const config = yield* WorkerConfig
        const auth = yield* McpAuth
        const principal = yield* auth.resolve(request, ctx)
        if (Option.isNone(principal)) {
          return unauthorized(config.mcpResourceUrl)
        }
        const handler = createMcpHandler(
          () =>
            createServer({
              principal: principal.value,
              run: runtime.runPromise,
              writeAllowed: auth.writeAllowed(principal.value),
            }),
          { route: "/mcp", allowedHostnames: [new URL(config.mcpResourceUrl).hostname] },
        )
        return yield* Effect.promise(() => handler(request, workerEnv, ctx))
      }),
    )
  return { handle, dispose: () => runtime.dispose() }
}
