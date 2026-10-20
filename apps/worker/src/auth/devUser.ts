import { UserId } from "@tanren/shared"

/**
 * Seed user of docs/design/local-dev.md §1: signing in as this email locally reuses its id, and the
 * dev MCP token resolves to it. Kept apart from `BetterAuth.ts` so `mcp/` need not import Better Auth.
 */
export const DEV_USER_EMAIL = "dev@tanren.local"
export const DEV_USER_ID = UserId.make("00000000-0000-4000-8000-000000000001")
