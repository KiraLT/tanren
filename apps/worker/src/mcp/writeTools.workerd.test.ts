import { env } from "cloudflare:workers"
import { describe, expect, it } from "@effect/vitest"
import { CurrentPlan, IdGenerator, LogSessionResult, WritePlanWeekResult } from "@tanren/shared"
import { Array as Arr, Effect, Layer, Option, Order, Schema } from "effect"
import { d1Persistence } from "../app"
import { DEV_USER_ID } from "../auth/devUser"
import { ExerciseRepo, PlanRepo } from "../repos"
import { exercise } from "../sync/fixtures"
import { countingD1 } from "../testing/countingD1"
import { readTools } from "./tools"
import { writeTools } from "./writeTools"

// Real D1 (workerd) cost of the replace paths. The counts are printed, not budgeted: the
// statement budget is an open Lead decision.
const counting = countingD1(env.DB)
const persistence = d1Persistence(counting.db)
const SQUAT = 0x701
const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`

const runTool = (name: string, args: unknown) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const tool = Arr.findFirst([...readTools, ...writeTools], (each) => each.name === name)
      if (Option.isNone(tool)) {
        return yield* Effect.die(`no tool ${name}`)
      }
      return yield* tool.value.call(DEV_USER_ID, args)
    }).pipe(Effect.provide(Layer.mergeAll(persistence, IdGenerator.layer))),
  )

const currentPlan = (): Promise<CurrentPlan> =>
  Effect.runPromise(
    Effect.gen(function* () {
      return yield* (yield* PlanRepo).currentPlan(DEV_USER_ID)
    }).pipe(Effect.provide(persistence), Effect.map(Option.getOrThrow)),
  )

const measure = async <A>(step: string, run: () => Promise<A>): Promise<A> => {
  const before = counting.counts()
  const value = await run()
  const after = counting.counts()
  const row = {
    step,
    single: after.single - before.single,
    batches: after.batches - before.batches,
    batched: after.batched - before.batched,
  }
  console.log(`D1 ${step}: single=${row.single} batches=${row.batches} batched=${row.batched}`)
  return value
}

const plannedSet = (n: number) => ({
  exerciseId: id(SQUAT),
  order: n,
  targetWeightKg: 100,
  targetReps: { _tag: "Exact", reps: 5 },
  targetRpe: null,
  restSeconds: null,
  note: null,
})
const sessionsOf = (count: number, sets: number) =>
  Arr.makeBy(count, (s) => ({
    order: s,
    name: `Day ${s + 1}`,
    scheduledDate: null,
    notes: null,
    sets: Arr.makeBy(sets, plannedSet),
  }))
const weekArgs = (weekStart: string, sessions: unknown, planId: unknown = null) => ({
  planId,
  newPlan: { name: "Replace Block", goal: "Strength" },
  weekStart,
  intent: null,
  sessions,
})
const sortedSetIds = (plan: CurrentPlan) =>
  Arr.sort(
    Arr.map(plan.sets, (x) => x.id),
    Order.String,
  )
const decodeWeek = Schema.decodeUnknownSync(WritePlanWeekResult)
const decodePlan = Schema.decodeUnknownSync(CurrentPlan)
const decodeLog = Schema.decodeUnknownSync(LogSessionResult)

const WEEK_A = "2026-10-19"
const WEEK_B = "2026-10-26"
const WEEK_C = "2026-11-02"

describe("D1 cost of the write-tool replace paths (counts printed, not budgeted)", () => {
  it("write_plan_week 4×6 into a new week of an active plan, then replace it, then drop a session", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* (yield* ExerciseRepo).put(DEV_USER_ID, [
          exercise(SQUAT, { userId: DEV_USER_ID, name: "Replace Squat" }),
        ])
      }).pipe(Effect.provide(persistence)),
    )
    // An active plan exists first (a small week), so the 4x6 week is a NEW week of it.
    await runTool("write_plan_week", weekArgs(WEEK_A, sessionsOf(1, 1)))

    const created = decodeWeek(
      await measure("(a) write_plan_week 4x6 new week", () =>
        runTool("write_plan_week", weekArgs(WEEK_B, sessionsOf(4, 6))),
      ),
    )
    expect(created.replaced).toBe(false)
    expect(created.sessions.map((s) => [s.order, s.sets])).toEqual([
      [0, 6],
      [1, 6],
      [2, 6],
      [3, 6],
    ])

    const setIdsBefore = sortedSetIds(await currentPlan())
    const again = decodeWeek(
      await measure("(b) write_plan_week 4x6 re-send (replace)", () =>
        runTool("write_plan_week", weekArgs(WEEK_B, sessionsOf(4, 6))),
      ),
    )
    expect(again.replaced).toBe(true)
    expect(again.planWeekId).toBe(created.planWeekId)
    expect(again.sessions.map((s) => s.plannedSessionId)).toEqual(
      created.sessions.map((s) => s.plannedSessionId),
    )
    expect(sortedSetIds(await currentPlan())).toEqual(setIdsBefore)
    const afterReplace = decodePlan(await runTool("get_current_plan", {}))
    expect(
      afterReplace.sets.filter((s) =>
        created.sessions.some((c) => c.plannedSessionId === s.plannedSessionId),
      ).length,
    ).toBe(24)

    const dropped = decodeWeek(
      await measure("(c) write_plan_week re-send 3 of 4 sessions (drop one)", () =>
        runTool("write_plan_week", weekArgs(WEEK_B, sessionsOf(3, 6))),
      ),
    )
    expect(dropped.sessions.length).toBe(3)
    const droppedId = created.sessions[3]?.plannedSessionId
    const plan = await currentPlan()
    expect(plan.sessions.map((s) => s.id)).not.toContain(droppedId)
    expect(plan.sessions.filter((s) => s.planWeekId === created.planWeekId).length).toBe(3)
    expect(plan.sets.filter((s) => s.plannedSessionId === droppedId).length).toBe(0)
  })

  it("write_plan_week 6×8 into a new week, then replace", async () => {
    const created = decodeWeek(
      await measure("write_plan_week 6x8 new week", () =>
        runTool("write_plan_week", weekArgs(WEEK_C, sessionsOf(6, 8))),
      ),
    )
    expect(created.replaced).toBe(false)
    expect(created.sessions.map((s) => s.sets)).toEqual([8, 8, 8, 8, 8, 8])
    const again = decodeWeek(
      await measure("write_plan_week 6x8 re-send (replace)", () =>
        runTool("write_plan_week", weekArgs(WEEK_C, sessionsOf(6, 8))),
      ),
    )
    expect(again.replaced).toBe(true)
    expect(again.sessions.map((s) => s.plannedSessionId)).toEqual(
      created.sessions.map((s) => s.plannedSessionId),
    )
  })

  it("log_session creates, then replaces by sessionId with 20 sets", async () => {
    const logArgs = (sessionId: string | undefined, sets: number) => ({
      startedAt: "2026-10-20T08:00:00.000Z",
      finishedAt: "2026-10-20T09:00:00.000Z",
      plannedSessionId: null,
      notes: null,
      ...(sessionId === undefined ? {} : { sessionId }),
      sets: Arr.makeBy(sets, (n) => ({
        exerciseId: id(SQUAT),
        weightKg: 100 + n,
        reps: 5,
        rpe: null,
        note: null,
      })),
    })
    const first = decodeLog(
      await measure("(d) log_session create 20 sets", () =>
        runTool("log_session", logArgs(undefined, 20)),
      ),
    )
    expect(first.sets.length).toBe(20)
    const second = decodeLog(
      await measure("(d) log_session replace by sessionId 20 sets", () =>
        runTool("log_session", logArgs(first.session.id, 20)),
      ),
    )
    expect(second.session.id).toBe(first.session.id)
    expect(second.sets.length).toBe(20)
    expect(second.sets.map((s) => s.id)).not.toContain(first.sets[0]?.id)
  })
})
