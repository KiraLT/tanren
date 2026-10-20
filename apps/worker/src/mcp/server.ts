import { type CallToolResult, McpServer } from "@modelcontextprotocol/server"
import type { McpToolName, UserId } from "@tanren/shared"
import { Effect, Predicate, Schema } from "effect"
import type { McpPrincipal } from "./McpAuth"
import { type AnyTool, readTools, type ToolDeps } from "./tools"
import { writeToolAnnotations, writeTools } from "./writeTools"

// MCP SDK adapter (docs/design/mcp.md §4). The `McpServer` instance is the only non-Effect code:
// every tool result, including its errors, is built as an Effect value and run by `run`.

export interface ServerInput {
  /** The caller; tools get `principal.userId` by closure, `scopes` decide registration (S5-T4). */
  readonly principal: McpPrincipal
  /** Runs a tool program on the isolate's runtime (`ManagedRuntime.runPromise`). */
  readonly run: (effect: Effect.Effect<CallToolResult, never, ToolDeps>) => Promise<CallToolResult>
}

const SERVER_INFO = { name: "tanren", version: "0.4.0" }

const textResult = (text: string): CallToolResult => ({ content: [{ type: "text", text }] })

const errorResult = (text: string): CallToolResult => ({ ...textResult(text), isError: true })

/**
 * `structuredContent` must be a JSON object; a tool whose encoded output is not one
 * (`get_current_plan` → `null`) answers with the text block only.
 */
const successResult = (encoded: unknown): CallToolResult => {
  const text = JSON.stringify(encoded)
  return Predicate.isObject(encoded)
    ? { ...textResult(text), structuredContent: encoded }
    : textResult(text)
}

/** A tool call as a result value: typed failures become `isError` results, never a throw. */
export const callTool = (
  tool: AnyTool,
  userId: UserId,
  args: unknown,
): Effect.Effect<CallToolResult, never, ToolDeps> =>
  tool.call(userId, args).pipe(
    Effect.map(successResult),
    Effect.catchTags({
      NotFound: (error) =>
        Effect.succeed(errorResult(`NotFound: ${error.entity} ${error.id} not found`)),
      ValidationError: (error) => Effect.succeed(errorResult(`ValidationError: ${error.message}`)),
      Forbidden: (error) => Effect.succeed(errorResult(`Forbidden: ${error.message}`)),
      PersistenceError: (error) =>
        Effect.logError("MCP tool storage failure", tool.name, error.operation, error.cause).pipe(
          Effect.as(errorResult("storage unavailable")),
        ),
    }),
    // Anything left is a defect (output encode `orDie`, a dying repo): log it, never show it.
    Effect.catchCause((cause) =>
      Effect.logError("MCP tool defect", tool.name, cause).pipe(
        Effect.as(errorResult("internal error")),
      ),
    ),
  )

/**
 * The SDK validates and advertises the wire (encoded) shape, then hands raw JSON args to `call`,
 * which decodes exactly once (a Standard Schema of the decoded side would decode twice and break
 * `Timestamp`). `toEncoded` builds a new schema, so attaching `~standard` mutates nothing shared.
 */
const inputSchemaOf = (tool: AnyTool) =>
  Schema.toStandardJSONSchemaV1(Schema.toStandardSchemaV1(Schema.toEncoded(tool.input)))

interface ToolAnnotations {
  readonly readOnlyHint: boolean
  readonly idempotentHint?: boolean
  readonly destructiveHint?: boolean
}

const READ_ONLY: ToolAnnotations = { readOnlyHint: true }

/** Every tool's annotations; a new `MCP_TOOLS` name without an entry is a compile error. */
const ANNOTATIONS: { readonly [N in McpToolName]: ToolAnnotations } = {
  get_overview: READ_ONLY,
  get_exercise_history: READ_ONLY,
  list_sessions: READ_ONLY,
  get_current_plan: READ_ONLY,
  search_exercises: READ_ONLY,
  ...writeToolAnnotations,
}

/**
 * The tools a principal may call (oauth.md §4): reads with `tanren:read`, writes with
 * `tanren:write`. The OAuth provider advertises `requiredScopes` but does not enforce them, so the
 * registration here is the enforcement; no scope → no tools.
 */
export const toolsFor = (principal: McpPrincipal): ReadonlyArray<AnyTool> => [
  ...(principal.scopes.includes("tanren:read") ? readTools : []),
  ...(principal.scopes.includes("tanren:write") ? writeTools : []),
]

/**
 * One `McpServer` per request (stateless `createMcpHandler`) with the principal's tools
 * registered; an unregistered tool is "unknown tool" to the SDK.
 */
export const createServer = ({ principal, run }: ServerInput): McpServer => {
  const { userId } = principal
  const server = new McpServer(SERVER_INFO)
  toolsFor(principal).forEach((tool) => {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: inputSchemaOf(tool),
        annotations: { ...ANNOTATIONS[tool.name] },
      },
      (args) => run(callTool(tool, userId, args)),
    )
  })
  return server
}
