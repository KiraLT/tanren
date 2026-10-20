import { Schema } from "effect"
import { Plan, PlannedSession, PlannedSet, PlanWeek } from "./plan"

/**
 * The live active plan with its live weeks, planned sessions and planned sets, each list in
 * canonical order (DM §11.2): weeks by `(weekStart, createdAt, id)`, sessions by week then
 * `(order, createdAt, id)`, sets by week, session, then `(order, createdAt, id)`.
 * Served by `GET /plans/current`, the MCP `get_current_plan` tool and read by the mobile Plan screen.
 */
export const CurrentPlan = Schema.Struct({
  plan: Plan,
  weeks: Schema.Array(PlanWeek),
  sessions: Schema.Array(PlannedSession),
  sets: Schema.Array(PlannedSet),
})
export type CurrentPlan = typeof CurrentPlan.Type
export type CurrentPlanEncoded = typeof CurrentPlan.Encoded
