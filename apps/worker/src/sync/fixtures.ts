// Test-only row builders (`X.make` throws on invalid input, which fails the test).
import {
  Exercise,
  ExerciseId,
  LocalDate,
  Plan,
  PlanId,
  PlanWeek,
  PlanWeekId,
  Session,
  SessionId,
  type SyncChange,
  UserId,
} from "@tanren/shared"
import { DateTime, Option } from "effect"

export const userA = UserId.make("00000000-0000-4000-8000-0000000000a1")
export const userB = UserId.make("00000000-0000-4000-8000-0000000000b1")
export const at = (iso: string) => DateTime.makeUnsafe(iso)
export const T0 = at("2026-10-19T08:00:00.000Z")

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`

export const exercise = (
  n: number,
  fields: {
    userId?: UserId
    updatedAt?: DateTime.Utc
    createdAt?: DateTime.Utc
    name?: string
  } = {},
): Exercise =>
  Exercise.make({
    id: ExerciseId.make(id(n)),
    userId: fields.userId ?? userA,
    createdAt: fields.createdAt ?? T0,
    updatedAt: fields.updatedAt ?? T0,
    deletedAt: Option.none(),
    name: fields.name ?? `Exercise ${n}`,
    aliases: [],
    muscleGroups: [],
    notes: Option.none(),
  })

export const plan = (n: number, status: "active" | "archived" = "active"): Plan =>
  Plan.make({
    id: PlanId.make(id(n)),
    userId: userA,
    createdAt: T0,
    updatedAt: T0,
    deletedAt: Option.none(),
    name: "Block",
    goal: "Strength",
    startDate: LocalDate.make("2026-10-19"),
    status,
  })

export const week = (n: number, planN: number, weekStart = "2026-10-19"): PlanWeek =>
  PlanWeek.make({
    id: PlanWeekId.make(id(n)),
    userId: userA,
    createdAt: T0,
    updatedAt: T0,
    deletedAt: Option.none(),
    planId: PlanId.make(id(planN)),
    weekStart: LocalDate.make(weekStart),
    intent: Option.none(),
  })

export const session = (n: number, startedAt: DateTime.Utc, deleted = false): Session =>
  Session.make({
    id: SessionId.make(id(n)),
    userId: userA,
    createdAt: T0,
    updatedAt: T0,
    deletedAt: deleted ? Option.some(T0) : Option.none(),
    startedAt,
    finishedAt: Option.none(),
    plannedSessionId: Option.none(),
    notes: Option.none(),
  })

export const ex = (row: Exercise): SyncChange => ({ table: "exercise", row })
