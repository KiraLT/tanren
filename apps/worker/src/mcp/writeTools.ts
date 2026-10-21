import {
  type CurrentPlan,
  type ExerciseId,
  LogSessionInput,
  LogSessionResult,
  NotFound,
  newId,
  Plan,
  PlanId,
  PlannedSession,
  PlannedSessionId,
  PlannedSet,
  PlannedSetId,
  PlanWeek,
  PlanWeekId,
  Profile,
  Session,
  SessionId,
  SetId,
  UpdateProfileInput,
  UpdateProfileResult,
  type UserId,
  ValidationError,
  WorkoutSet,
  WritePlanWeekInput,
  WritePlanWeekResult,
} from "@tanren/shared"
import { Array as Arr, DateTime, Effect, Option } from "effect"
import { ExerciseRepo, PlanRepo, ProfileRepo, SessionRepo } from "../repos"
import { type AnyTool, eraseTool, type Tool } from "./tools"

// The MCP write tools (docs/design/oauth.md §5) as plain Effect programs over the repository
// ports. Every check runs before the first write; every row carries the caller's `userId`.

/** MCP tool annotations (oauth.md §5); `Tool` has no field for them, so `server.ts` reads these. */
export const writeToolAnnotations = {
  write_plan_week: { readOnlyHint: false, idempotentHint: true, destructiveHint: true },
  // Destructive only with `sessionId` (replace); annotations are per tool, so the worst case.
  log_session: { readOnlyHint: false, idempotentHint: false, destructiveHint: true },
  update_profile: { readOnlyHint: false, idempotentHint: true, destructiveHint: false },
} as const

/** `X.makeEffect` fails with a bare issue; a row we build failing its schema is a caller error. */
const toValidationError = Effect.mapError(ValidationError.fromIssue)

const invalid = (message: string, path: ReadonlyArray<string | number>) =>
  new ValidationError({ message, issues: [{ path, message }] })

/** The first value that occurs twice, if any. */
const firstDuplicate = (values: ReadonlyArray<number>): Option.Option<number> =>
  Arr.findFirst(values, (value, index) => values.indexOf(value) !== index)

/** Every id must be one of the caller's live exercises (1 statement, none for no ids). */
const requireExercises = Effect.fn("requireExercises")(function* (
  userId: UserId,
  ids: ReadonlyArray<ExerciseId>,
) {
  if (!Arr.isReadonlyArrayNonEmpty(ids)) {
    return
  }
  const known = yield* (yield* ExerciseRepo).list(userId, { includeDeleted: false })
  const missing = Arr.findFirst(ids, (id) => !known.some((exercise) => exercise.id === id))
  if (Option.isSome(missing)) {
    return yield* new NotFound({ entity: "exercise", id: missing.value })
  }
})

/** The plan the week goes into: the active one, or a new active plan from `newPlan`. */
const resolvePlan = Effect.fn("resolvePlan")(function* (
  userId: UserId,
  current: Option.Option<CurrentPlan>,
  input: WritePlanWeekInput,
  now: DateTime.Utc,
) {
  if (Option.isSome(input.planId)) {
    if (Option.isNone(current) || current.value.plan.id !== input.planId.value) {
      return yield* invalid("planId is not the active plan", ["planId"])
    }
    return { plan: current.value.plan, created: false }
  }
  if (Option.isSome(current)) {
    return { plan: current.value.plan, created: false }
  }
  if (input.newPlan === undefined) {
    return yield* invalid("no active plan; pass newPlan", ["newPlan"])
  }
  const plan = yield* Plan.makeEffect({
    id: yield* newId(PlanId),
    userId,
    createdAt: now,
    updatedAt: now,
    deletedAt: Option.none(),
    name: input.newPlan.name,
    goal: input.newPlan.goal,
    startDate: input.weekStart,
    status: "active",
  }).pipe(toValidationError)
  return { plan, created: true }
})

/** `order` unique per week and per session. */
const checkOrders = Effect.fn("checkOrders")(function* (input: WritePlanWeekInput) {
  const sessionDuplicate = firstDuplicate(Arr.map(input.sessions, (session) => session.order))
  if (Option.isSome(sessionDuplicate)) {
    return yield* invalid(`duplicate session order ${sessionDuplicate.value}`, ["sessions"])
  }
  const setDuplicate = Arr.findFirst(input.sessions, (session, index) =>
    Option.map(firstDuplicate(Arr.map(session.sets, (set) => set.order)), (order) => ({
      index,
      order,
    })),
  )
  if (Option.isSome(setDuplicate)) {
    const { index, order } = setDuplicate.value
    return yield* invalid(`duplicate set order ${order} in session ${index}`, [
      "sessions",
      index,
      "sets",
    ])
  }
})

export const writePlanWeek: Tool<typeof WritePlanWeekInput, typeof WritePlanWeekResult> = {
  name: "write_plan_week",
  kind: "write",
  description:
    "Write one week of the active plan (weekStart YYYY-MM-DD, any weekday). Re-sending the same " +
    "weekStart replaces that week: planned sessions keep their id when their `order` matches, " +
    "sessions whose order is not sent are deleted, and within a kept session planned sets do " +
    "the same by their own `order` (matching order keeps the id, missing order is deleted). planId " +
    "null = the active plan; when there is none, pass newPlan { name, goal } to create it. " +
    "order must be unique per week and per session; exerciseId values come from get_overview " +
    "or get_current_plan. Weights in kg.",
  input: WritePlanWeekInput,
  output: WritePlanWeekResult,
  run: Effect.fn("write_plan_week")(function* (userId: UserId, input: WritePlanWeekInput) {
    const planRepo = yield* PlanRepo
    const now = yield* DateTime.now
    const current = yield* planRepo.currentPlan(userId)
    const { plan, created } = yield* resolvePlan(userId, current, input, now)
    yield* checkOrders(input)
    yield* requireExercises(
      userId,
      Arr.flatMap(input.sessions, (session) => Arr.map(session.sets, (set) => set.exerciseId)),
    )

    // A new plan has no weeks; otherwise `current` is that plan, live rows only.
    const priorWeek = Option.flatMap(current, ({ weeks }) =>
      Arr.findFirst(weeks, (week) => week.weekStart === input.weekStart),
    )
    const week = yield* Option.match(priorWeek, {
      onSome: (prior) => PlanWeek.makeEffect({ ...prior, intent: input.intent, updatedAt: now }),
      onNone: () =>
        Effect.flatMap(newId(PlanWeekId), (id) =>
          PlanWeek.makeEffect({
            id,
            userId,
            createdAt: now,
            updatedAt: now,
            deletedAt: Option.none(),
            planId: plan.id,
            weekStart: input.weekStart,
            intent: input.intent,
          }),
        ),
    }).pipe(toValidationError)
    const priorSessions = Option.match(current, {
      onNone: () => [],
      onSome: ({ sessions }) =>
        Option.isSome(priorWeek)
          ? Arr.filter(sessions, (session) => session.planWeekId === priorWeek.value.id)
          : [],
    })
    const priorSessionIds: ReadonlyArray<string> = Arr.map(priorSessions, (session) => session.id)
    const priorSets = Option.match(current, {
      onNone: () => [],
      onSome: ({ sets }) =>
        Arr.filter(sets, (set) => priorSessionIds.includes(set.plannedSessionId)),
    })

    const written = yield* Effect.forEach(input.sessions, (spec) =>
      Effect.gen(function* () {
        const prior = Arr.findFirst(priorSessions, (session) => session.order === spec.order)
        const id = Option.isSome(prior) ? prior.value.id : yield* newId(PlannedSessionId)
        const session = yield* PlannedSession.makeEffect({
          id,
          userId,
          createdAt: Option.isSome(prior) ? prior.value.createdAt : now,
          updatedAt: now,
          deletedAt: Option.none(),
          planWeekId: week.id,
          order: spec.order,
          name: spec.name,
          scheduledDate: spec.scheduledDate,
          notes: spec.notes,
        }).pipe(toValidationError)
        // Like sessions: a live set of the kept session with the same `order` keeps its id.
        const priorOwnSets = Arr.filter(priorSets, (set) => set.plannedSessionId === id)
        const sets = yield* Effect.forEach(spec.sets, (setSpec) =>
          Effect.gen(function* () {
            const priorSet = Arr.findFirst(priorOwnSets, (set) => set.order === setSpec.order)
            return yield* PlannedSet.makeEffect({
              ...setSpec,
              id: Option.isSome(priorSet) ? priorSet.value.id : yield* newId(PlannedSetId),
              userId,
              createdAt: Option.isSome(priorSet) ? priorSet.value.createdAt : now,
              updatedAt: now,
              deletedAt: Option.none(),
              plannedSessionId: id,
            }).pipe(toValidationError)
          }),
        )
        return { session, sets }
      }),
    )
    const keptIds: ReadonlyArray<string> = Arr.map(written, ({ session }) => session.id)
    const droppedSessions = yield* Effect.forEach(
      Arr.filter(priorSessions, (session) => !keptIds.includes(session.id)),
      (session) =>
        PlannedSession.makeEffect({
          ...session,
          deletedAt: Option.some(now),
          updatedAt: now,
        }).pipe(toValidationError),
    )
    // Sets of dropped sessions and orders not re-sent (a set id is never kept by two inputs).
    const keptSetIds: ReadonlyArray<string> = Arr.flatMap(written, ({ sets }) =>
      Arr.map(sets, (set) => set.id),
    )
    const droppedSets = yield* Effect.forEach(
      Arr.filter(priorSets, (set) => !keptSetIds.includes(set.id)),
      (set) =>
        PlannedSet.makeEffect({ ...set, deletedAt: Option.some(now), updatedAt: now }).pipe(
          toValidationError,
        ),
    )

    // Parents first (FKs); an empty batch writes nothing.
    if (created) {
      yield* planRepo.putPlans(userId, [plan])
    }
    yield* planRepo.putPlanWeeks(userId, [week])
    yield* planRepo.putPlannedSessions(userId, [
      ...Arr.map(written, ({ session }) => session),
      ...droppedSessions,
    ])
    yield* planRepo.putPlannedSets(userId, [
      ...droppedSets,
      ...Arr.flatMap(written, ({ sets }) => sets),
    ])
    return {
      planId: plan.id,
      planWeekId: week.id,
      replaced: Option.isSome(priorWeek),
      sessions: Arr.map(written, ({ session, sets }) => ({
        plannedSessionId: session.id,
        order: session.order,
        name: session.name,
        sets: sets.length,
      })),
    }
  }),
}

/** The id, `createdAt` and live sets of the session being written. */
const resolveSession = Effect.fn("resolveSession")(function* (
  userId: UserId,
  input: LogSessionInput,
  now: DateTime.Utc,
) {
  const sessionRepo = yield* SessionRepo
  if (input.sessionId === undefined) {
    const sameStart = yield* sessionRepo.listSessions(userId, {
      from: input.startedAt,
      to: DateTime.add(input.startedAt, { milliseconds: 1 }),
    })
    if (Arr.isReadonlyArrayNonEmpty(sameStart)) {
      return yield* invalid(
        `a session already starts at ${DateTime.formatIso(input.startedAt)}; pass sessionId to replace it`,
        ["startedAt"],
      )
    }
    return { id: yield* newId(SessionId), createdAt: now, priorSets: [] }
  }
  const id = input.sessionId
  const stored = yield* sessionRepo.getSession(userId, id)
  if (Option.isNone(stored) || Option.isSome(stored.value.deletedAt)) {
    return yield* new NotFound({ entity: "session", id })
  }
  const priorSets = yield* sessionRepo.listSets(userId, id)
  return { id, createdAt: stored.value.createdAt, priorSets }
})

export const logSession: Tool<typeof LogSessionInput, typeof LogSessionResult> = {
  name: "log_session",
  kind: "write",
  description:
    "Log a finished workout: startedAt/finishedAt ISO-8601 UTC, sets in the order performed " +
    "(weights in kg, loggedAt defaults to startedAt). Omit sessionId to create; a session that " +
    "starts at exactly the same instant is refused. Pass sessionId to replace that session and " +
    "all its sets (safe retry). plannedSessionId links a planned session of the active plan " +
    "(from get_current_plan).",
  input: LogSessionInput,
  output: LogSessionResult,
  run: Effect.fn("log_session")(function* (userId: UserId, input: LogSessionInput) {
    const now = yield* DateTime.now
    const { id, createdAt, priorSets } = yield* resolveSession(userId, input, now)
    const session = yield* Session.makeEffect({
      id,
      userId,
      createdAt,
      updatedAt: now,
      deletedAt: Option.none(),
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      plannedSessionId: input.plannedSessionId,
      notes: input.notes,
    }).pipe(toValidationError)
    if (Option.isSome(input.plannedSessionId)) {
      const plannedId = input.plannedSessionId.value
      const current = yield* (yield* PlanRepo).currentPlan(userId)
      const known = Option.exists(current, ({ sessions }) =>
        sessions.some((planned) => planned.id === plannedId),
      )
      if (!known) {
        return yield* new NotFound({ entity: "plannedSession", id: plannedId })
      }
    }
    yield* requireExercises(
      userId,
      Arr.map(input.sets, (set) => set.exerciseId),
    )
    const sets = yield* Effect.forEach(input.sets, (spec, order) =>
      Effect.flatMap(newId(SetId), (setId) =>
        WorkoutSet.makeEffect({
          id: setId,
          userId,
          createdAt: now,
          updatedAt: now,
          deletedAt: Option.none(),
          sessionId: id,
          exerciseId: spec.exerciseId,
          order,
          weightKg: spec.weightKg,
          reps: spec.reps,
          rpe: spec.rpe,
          note: spec.note,
          plannedSetId: Option.none(),
          loggedAt: spec.loggedAt ?? input.startedAt,
        }).pipe(toValidationError),
      ),
    )
    const droppedSets = yield* Effect.forEach(priorSets, (set) =>
      WorkoutSet.makeEffect({ ...set, deletedAt: Option.some(now), updatedAt: now }).pipe(
        toValidationError,
      ),
    )
    const sessionRepo = yield* SessionRepo
    yield* sessionRepo.putSessions(userId, [session])
    yield* sessionRepo.putSets(userId, [...droppedSets, ...sets])
    return { session, sets }
  }),
}

export const updateProfile: Tool<typeof UpdateProfileInput, typeof UpdateProfileResult> = {
  name: "update_profile",
  kind: "write",
  description:
    "Update the training profile: goals (by priority), constraints, availableDays, locations " +
    "(each { id, name, equipment }; ≤ 10), activeLocationId (one of locations, or null), " +
    "timezone (IANA). Only the keys you send change. Removing the active location requires " +
    "sending activeLocationId too (null clears it). The first call creates the profile and " +
    "must include timezone.",
  input: UpdateProfileInput,
  output: UpdateProfileResult,
  run: Effect.fn("update_profile")(function* (userId: UserId, patch: UpdateProfileInput) {
    const profileRepo = yield* ProfileRepo
    const now = yield* DateTime.now
    const stored = yield* profileRepo.get(userId)
    const timezone = patch.timezone
    const profile = yield* Option.match(stored, {
      // A tombstoned profile is revived: the caller is writing it again.
      onSome: (current) =>
        Profile.makeEffect({
          ...current,
          ...patch,
          id: userId,
          userId,
          updatedAt: now,
          deletedAt: Option.none(),
        }).pipe(toValidationError),
      onNone: () =>
        timezone === undefined
          ? Effect.fail(invalid("no profile yet; timezone is required", ["timezone"]))
          : Profile.makeEffect({
              goals: [],
              constraints: [],
              availableDays: [],
              locations: [],
              activeLocationId: Option.none(),
              ...patch,
              timezone,
              id: userId,
              userId,
              createdAt: now,
              updatedAt: now,
              deletedAt: Option.none(),
            }).pipe(toValidationError),
    })
    yield* profileRepo.put(userId, [profile])
    return profile
  }),
}

/** The step-5 write tools, in `MCP_TOOLS` order. */
export const writeTools: ReadonlyArray<AnyTool> = [
  eraseTool(writePlanWeek),
  eraseTool(logSession),
  eraseTool(updateProfile),
]
