/** Test-only fixtures, built from wire JSON through the shared schemas so they cannot drift. */
import { env } from "cloudflare:workers"
import {
  Exercise,
  type ExerciseEncoded,
  Plan,
  type PlanEncoded,
  PlannedSession,
  type PlannedSessionEncoded,
  PlannedSet,
  type PlannedSetEncoded,
  PlanWeek,
  type PlanWeekEncoded,
  Profile,
  type ProfileEncoded,
  Session,
  type SessionEncoded,
  WorkoutSet,
  type WorkoutSetEncoded,
} from "@tanren/shared"
import { Layer, Schema } from "effect"
import { D1Layer } from "../client"
import { Repositories } from "../repositories"

/** Repositories plus the `D1Client`/`SqlClient` they run on, over the test file's migrated D1. */
export const TestLayer = Repositories.layer.pipe(Layer.provideMerge(D1Layer(env.DB)))

export const userA = "00000000-0000-4000-8000-00000000000a"
export const userB = "00000000-0000-4000-8000-00000000000b"
export const t1 = "2026-10-19T08:00:00.000Z"
export const t2 = "2026-10-20T08:00:00.000Z"

export const exercise = (overrides: Partial<ExerciseEncoded> & Pick<ExerciseEncoded, "id">) =>
  Schema.decodeUnknownSync(Exercise)({
    userId: userA,
    createdAt: t1,
    updatedAt: t1,
    deletedAt: null,
    name: "Bench Press",
    aliases: ["bench"],
    muscleGroups: ["chest", "triceps"],
    notes: null,
    ...overrides,
  })

export const profile = (overrides: Partial<ProfileEncoded> = {}) =>
  Schema.decodeUnknownSync(Profile)({
    id: userA,
    userId: userA,
    createdAt: t1,
    updatedAt: t1,
    deletedAt: null,
    goals: [{ kind: "strength", note: null }],
    constraints: ["no overhead pressing"],
    availableDays: ["mon", "wed", "fri"],
    equipment: [{ kind: "barbell", note: null }],
    timezone: "Europe/Berlin",
    ...overrides,
  })

const rowDefaults = { userId: userA, createdAt: t1, updatedAt: t1, deletedAt: null } as const

export const plan = (overrides: Partial<PlanEncoded> & Pick<PlanEncoded, "id">) =>
  Schema.decodeUnknownSync(Plan)({
    ...rowDefaults,
    name: "Upper / Lower",
    goal: "Get stronger",
    startDate: "2026-10-19",
    status: "active",
    ...overrides,
  })

export const planWeek = (
  overrides: Partial<PlanWeekEncoded> & Pick<PlanWeekEncoded, "id" | "planId">,
) =>
  Schema.decodeUnknownSync(PlanWeek)({
    ...rowDefaults,
    weekStart: "2026-10-19",
    intent: null,
    ...overrides,
  })

export const plannedSession = (
  overrides: Partial<PlannedSessionEncoded> & Pick<PlannedSessionEncoded, "id" | "planWeekId">,
) =>
  Schema.decodeUnknownSync(PlannedSession)({
    ...rowDefaults,
    order: 0,
    name: "Upper A",
    scheduledDate: null,
    notes: null,
    ...overrides,
  })

export const plannedSet = (
  overrides: Partial<PlannedSetEncoded> &
    Pick<PlannedSetEncoded, "id" | "plannedSessionId" | "exerciseId">,
) =>
  Schema.decodeUnknownSync(PlannedSet)({
    ...rowDefaults,
    order: 0,
    targetWeightKg: 80,
    targetReps: { _tag: "Exact", reps: 5 },
    targetRpe: null,
    restSeconds: 120,
    note: null,
    ...overrides,
  })

export const session = (overrides: Partial<SessionEncoded> & Pick<SessionEncoded, "id">) =>
  Schema.decodeUnknownSync(Session)({
    ...rowDefaults,
    startedAt: t1,
    finishedAt: null,
    plannedSessionId: null,
    notes: null,
    ...overrides,
  })

export const workoutSet = (
  overrides: Partial<WorkoutSetEncoded> &
    Pick<WorkoutSetEncoded, "id" | "sessionId" | "exerciseId">,
) =>
  Schema.decodeUnknownSync(WorkoutSet)({
    ...rowDefaults,
    order: 0,
    weightKg: 100,
    reps: 5,
    rpe: null,
    note: null,
    plannedSetId: null,
    loggedAt: t1,
    ...overrides,
  })
