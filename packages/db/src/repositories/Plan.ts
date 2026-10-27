import { D1Client } from "@effect/sql-d1"
import {
  type CurrentPlan,
  type Forbidden,
  type Plan,
  PlanId,
  type PlannedSession,
  PlannedSessionId,
  PlannedSessionRow,
  type PlannedSet,
  PlannedSetRow,
  PlanRow,
  type PlanWeek,
  PlanWeekRow,
  ROW_KEYS,
  ROW_TABLE,
  UserId,
} from "@tanren/shared"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { SqlSchema } from "effect/sql"
import { type PersistenceError, persistenceError } from "../errors"
import { makePut } from "../syncClock"

type Put<A> = (
  userId: UserId,
  rows: ReadonlyArray<A>,
) => Effect.Effect<void, PersistenceError | Forbidden>

export interface PlanRepoShape {
  readonly getPlan: (
    userId: UserId,
    id: PlanId,
  ) => Effect.Effect<Option.Option<Plan>, PersistenceError>
  /** Ordered by `(created_at, id)`; tombstones only with `includeDeleted`. */
  readonly listPlans: (
    userId: UserId,
    opts: { readonly includeDeleted: boolean },
  ) => Effect.Effect<ReadonlyArray<Plan>, PersistenceError>
  /** Live weeks of one plan, by `(week_start, created_at, id)`. */
  readonly listWeeks: (
    userId: UserId,
    planId: PlanId,
  ) => Effect.Effect<ReadonlyArray<PlanWeek>, PersistenceError>
  /** One live planned session of the user; `None` when it is missing, foreign or soft-deleted. */
  readonly getPlannedSession: (
    userId: UserId,
    id: PlannedSessionId,
  ) => Effect.Effect<Option.Option<PlannedSession>, PersistenceError>
  /** The user's live active plan, assembled; `None` when there is none. */
  readonly currentPlan: (
    userId: UserId,
  ) => Effect.Effect<Option.Option<CurrentPlan>, PersistenceError>
  /**
   * Upserts per table, each in one batch (db.md §6). Write parents first: a missing parent (FK),
   * a second live active plan or a second live week with the same `(plan_id, week_start)` aborts
   * the whole batch with `PersistenceError`.
   */
  readonly putPlans: Put<Plan>
  readonly putPlanWeeks: Put<PlanWeek>
  readonly putPlannedSessions: Put<PlannedSession>
  readonly putPlannedSets: Put<PlannedSet>
}

export class PlanRepo extends Context.Service<PlanRepo, PlanRepoShape>()("@tanren/PlanRepo", {
  make: Effect.gen(function* () {
    const sql = yield* D1Client.D1Client

    const findPlan = SqlSchema.findOneOption({
      Request: Schema.Struct({ userId: UserId, id: PlanId }),
      Result: PlanRow,
      execute: ({ userId, id }) => sql`SELECT * FROM plan WHERE user_id = ${userId} AND id = ${id}`,
    })
    const findPlans = SqlSchema.findAll({
      Request: Schema.Struct({ userId: UserId, includeDeleted: Schema.Boolean }),
      Result: PlanRow,
      execute: ({ userId, includeDeleted }) =>
        sql`SELECT * FROM plan WHERE user_id = ${userId}
          ${includeDeleted ? sql`` : sql`AND deleted_at IS NULL`}
          ORDER BY created_at, id`,
    })
    const findWeeks = SqlSchema.findAll({
      Request: Schema.Struct({ userId: UserId, planId: PlanId }),
      Result: PlanWeekRow,
      execute: ({ userId, planId }) =>
        sql`SELECT * FROM plan_week
          WHERE user_id = ${userId} AND plan_id = ${planId} AND deleted_at IS NULL
          ORDER BY week_start, created_at, id`,
    })
    const findPlannedSession = SqlSchema.findOneOption({
      Request: Schema.Struct({ userId: UserId, id: PlannedSessionId }),
      Result: PlannedSessionRow,
      execute: ({ userId, id }) =>
        sql`SELECT * FROM planned_session
          WHERE user_id = ${userId} AND id = ${id} AND deleted_at IS NULL`,
    })
    const findActive = SqlSchema.findOneOption({
      Request: Schema.Struct({ userId: UserId }),
      Result: PlanRow,
      execute: ({ userId }) =>
        sql`SELECT * FROM plan
          WHERE user_id = ${userId} AND status = 'active' AND deleted_at IS NULL
          ORDER BY created_at, id LIMIT 1`,
    })
    const findSessions = SqlSchema.findAll({
      Request: Schema.Struct({ userId: UserId, planId: PlanId }),
      Result: PlannedSessionRow,
      execute: ({ userId, planId }) =>
        sql`SELECT ps.* FROM planned_session ps
          JOIN plan_week pw ON pw.id = ps.plan_week_id AND pw.user_id = ps.user_id
          WHERE ps.user_id = ${userId} AND pw.plan_id = ${planId}
            AND ps.deleted_at IS NULL AND pw.deleted_at IS NULL
          ORDER BY pw.week_start, pw.created_at, pw.id, ps."order", ps.created_at, ps.id`,
    })
    const findSets = SqlSchema.findAll({
      Request: Schema.Struct({ userId: UserId, planId: PlanId }),
      Result: PlannedSetRow,
      execute: ({ userId, planId }) =>
        sql`SELECT st.* FROM planned_set st
          JOIN planned_session ps ON ps.id = st.planned_session_id AND ps.user_id = st.user_id
          JOIN plan_week pw ON pw.id = ps.plan_week_id AND pw.user_id = ps.user_id
          WHERE st.user_id = ${userId} AND pw.plan_id = ${planId}
            AND st.deleted_at IS NULL AND ps.deleted_at IS NULL AND pw.deleted_at IS NULL
          ORDER BY pw.week_start, pw.created_at, pw.id,
            ps."order", ps.created_at, ps.id, st."order", st.created_at, st.id`,
    })

    const currentPlan = Effect.fn("PlanRepo.currentPlan")(function* (userId: UserId) {
      const active = yield* findActive({ userId })
      return yield* Effect.transposeOption(
        Option.map(active, (found) =>
          Effect.all({
            weeks: findWeeks({ userId, planId: found.id }),
            sessions: findSessions({ userId, planId: found.id }),
            sets: findSets({ userId, planId: found.id }),
          }).pipe(Effect.map((rest) => ({ plan: found, ...rest }))),
        ),
      )
    })

    return {
      getPlan: (userId, id) =>
        findPlan({ userId, id }).pipe(Effect.mapError(persistenceError("plan.get"))),
      listPlans: (userId, { includeDeleted }) =>
        findPlans({ userId, includeDeleted }).pipe(Effect.mapError(persistenceError("plan.list"))),
      listWeeks: (userId, planId) =>
        findWeeks({ userId, planId }).pipe(Effect.mapError(persistenceError("planWeek.list"))),
      getPlannedSession: (userId, id) =>
        findPlannedSession({ userId, id }).pipe(
          Effect.mapError(persistenceError("plannedSession.get")),
        ),
      currentPlan: (userId) =>
        currentPlan(userId).pipe(Effect.mapError(persistenceError("plan.current"))),
      putPlans: makePut(sql, "plan", PlanRow, {
        table: ROW_TABLE.plan,
        keys: ROW_KEYS.plan,
        immutable: [],
      }),
      putPlanWeeks: makePut(sql, "planWeek", PlanWeekRow, {
        table: ROW_TABLE.planWeek,
        keys: ROW_KEYS.planWeek,
        immutable: ["planId"],
      }),
      putPlannedSessions: makePut(sql, "plannedSession", PlannedSessionRow, {
        table: ROW_TABLE.plannedSession,
        keys: ROW_KEYS.plannedSession,
        immutable: ["planWeekId"],
      }),
      putPlannedSets: makePut(sql, "plannedSet", PlannedSetRow, {
        table: ROW_TABLE.plannedSet,
        keys: ROW_KEYS.plannedSet,
        immutable: ["plannedSessionId"],
      }),
    }
  }),
}) {
  /** Needs `D1Client` (`D1Layer(env.DB)`). */
  static readonly layer = Layer.effect(this, this.make)
}
