import type { UserId } from "@tanren/shared"
import { Array as Arr, Context, Effect, Layer, Option, Redacted } from "effect"
import { DEV_USER_ID } from "../auth/devUser"
import { WorkerConfig } from "../Config"

/**
 * Who is calling the MCP endpoint (docs/design/mcp.md §2). Step 4 knows only the local dev token;
 * step 5 adds `layerOAuth`. Never reads cookies and never depends on `Sessions`/Better Auth.
 */
export interface McpAuthShape {
  /** `Some(userId)` for an authenticated request, `None` otherwise (the route answers 401). */
  readonly resolve: (request: Request) => Effect.Effect<Option.Option<UserId>>
}

/** The token of an `Authorization: Bearer <token>` header; the scheme is case-insensitive (RFC 7235). */
const bearerToken = (request: Request): Option.Option<string> =>
  Option.fromNullishOr(request.headers.get("Authorization")).pipe(
    Option.flatMap((header) => Option.fromNullishOr(/^Bearer +(\S+)\s*$/i.exec(header)?.[1])),
  )

const encoder = new TextEncoder()

/**
 * Compares every byte of the longer input, without an early exit, so the time taken does not
 * reveal how long a matching prefix is.
 */
export const constantTimeEqual = (left: string, right: string): boolean => {
  const a = encoder.encode(left)
  const b = encoder.encode(right)
  const length = Math.max(a.length, b.length)
  const diff = Arr.reduce(
    Arr.makeBy(length, (i) => i),
    a.length ^ b.length,
    (acc, i) => acc | ((a[i] ?? 0) ^ (b[i] ?? 0)),
  )
  return diff === 0
}

export class McpAuth extends Context.Service<McpAuth, McpAuthShape>()("@tanren/worker/McpAuth") {
  /**
   * `Bearer <DEV_MCP_TOKEN>` → the seed user, and only when `environment === "local"`. Anything
   * else (no token configured, wrong or missing header, another environment) → `None`.
   */
  static readonly layerDevToken: Layer.Layer<McpAuth, never, WorkerConfig> = Layer.effect(
    this,
    Effect.gen(function* () {
      const config = yield* WorkerConfig
      const resolve = (request: Request): Effect.Effect<Option.Option<UserId>> =>
        Effect.sync(() =>
          config.environment !== "local"
            ? Option.none()
            : Option.flatMap(config.devMcpToken, (expected) =>
                bearerToken(request).pipe(
                  Option.filter((token) => constantTimeEqual(token, Redacted.value(expected))),
                  Option.as(DEV_USER_ID),
                ),
              ),
        )
      return { resolve }
    }),
  )

  /** Tests: every request resolves to `userId`. */
  static readonly layerFixed = (userId: Option.Option<UserId>): Layer.Layer<McpAuth> =>
    Layer.succeed(this, this.of({ resolve: () => Effect.succeed(userId) }))
}
