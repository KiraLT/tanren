import { IdGenerator, SyncChange } from "@tanren/shared"
import { Array as Arr, DateTime, Effect, Option, pipe, Schema } from "effect"
import { CurrentUser } from "../services/CurrentUser"
import { LocalStore } from "../services/LocalStore"
import { StoreError } from "../services/SqlDriver"
import { LOCAL_USER_ID } from "./localUser"

interface SeedExercise {
  readonly name: string
  readonly muscleGroups: ReadonlyArray<string>
  readonly weightKg: number
  readonly reps: number
  readonly sets: number
  readonly restSeconds: number
}

/** The demo session planned for today on first run. */
const DEMO: ReadonlyArray<SeedExercise> = [
  {
    name: "Back Squat",
    muscleGroups: ["quads", "glutes"],
    weightKg: 100,
    reps: 5,
    sets: 3,
    restSeconds: 180,
  },
  {
    name: "Bench Press",
    muscleGroups: ["chest", "triceps"],
    weightKg: 80,
    reps: 5,
    sets: 3,
    restSeconds: 150,
  },
  {
    name: "Barbell Row",
    muscleGroups: ["upperBack", "lats"],
    weightKg: 70,
    reps: 8,
    sets: 3,
    restSeconds: 120,
  },
  {
    name: "Overhead Press",
    muscleGroups: ["shoulders", "triceps"],
    weightKg: 45,
    reps: 8,
    sets: 2,
    restSeconds: 120,
  },
]

const isEmpty = Effect.gen(function* () {
  const store = yield* LocalStore
  const rows = yield* store.all({ sql: `SELECT COUNT(*) AS "n" FROM "exercise"`, params: [] })
  return pipe(
    Arr.head(rows),
    Option.flatMap((row) => Option.fromNullishOr(row.n)),
    Option.exists((n) => n === 0),
  )
})

/**
 * First run only (no exercises yet): the local profile, the demo exercises and an active plan
 * whose current week holds a session scheduled for today. Seeded rows are not dirty: they are
 * local demo data and are never pushed. Built as wire changes and decoded with `SyncChange`, so
 * every value passes the shared schemas.
 */
export const seedIfEmpty: Effect.Effect<
  void,
  StoreError,
  LocalStore | IdGenerator | CurrentUser | DateTime.CurrentTimeZone
> = Effect.gen(function* () {
  // Signed in: the user's real data comes from the first pull, never the demo (INT-2).
  if (Option.isSome(yield* CurrentUser.use((user) => user.signedIn)) || !(yield* isEmpty)) {
    return
  }
  const store = yield* LocalStore
  const ids = yield* IdGenerator
  const now = yield* DateTime.nowInCurrentZone
  const zone = yield* DateTime.CurrentTimeZone
  const stamp = DateTime.formatIso(now)
  const today = DateTime.formatIsoDate(now)
  const weekStart = DateTime.formatIsoDate(DateTime.startOf(now, "week", { weekStartsOn: 1 }))
  const row = (id: string) => ({
    id,
    userId: LOCAL_USER_ID,
    createdAt: stamp,
    updatedAt: stamp,
    deletedAt: null,
  })
  const planId = yield* ids.next
  const planWeekId = yield* ids.next
  const plannedSessionId = yield* ids.next
  const exercises = yield* Effect.forEach(DEMO, (demo) =>
    Effect.map(ids.next, (id) => ({ id, demo })),
  )
  const plannedSets = yield* Effect.forEach(
    exercises.flatMap(({ id, demo }) => Arr.makeBy(demo.sets, () => ({ exerciseId: id, demo }))),
    (planned, order) =>
      Effect.map(ids.next, (id) => ({
        table: "plannedSet",
        row: {
          ...row(id),
          plannedSessionId,
          exerciseId: planned.exerciseId,
          order,
          targetWeightKg: planned.demo.weightKg,
          targetReps: { _tag: "Exact", reps: planned.demo.reps },
          targetRpe: null,
          restSeconds: planned.demo.restSeconds,
          note: null,
        },
      })),
  )
  const wire = [
    {
      table: "profile",
      row: {
        ...row(LOCAL_USER_ID),
        goals: [{ kind: "strength", note: null }],
        constraints: [],
        availableDays: ["mon", "wed", "fri"],
        timezone: DateTime.zoneToString(zone),
      },
    },
    ...exercises.map(({ id, demo }) => ({
      table: "exercise",
      row: {
        ...row(id),
        name: demo.name,
        aliases: [],
        muscleGroups: demo.muscleGroups,
        notes: null,
      },
    })),
    {
      table: "plan",
      row: {
        ...row(planId),
        name: "Demo plan",
        goal: "Get stronger",
        startDate: weekStart,
        status: "active",
      },
    },
    { table: "planWeek", row: { ...row(planWeekId), planId, weekStart, intent: null } },
    {
      table: "plannedSession",
      row: {
        ...row(plannedSessionId),
        planWeekId,
        order: 0,
        name: "Full body A",
        scheduledDate: today,
        notes: null,
      },
    },
    ...plannedSets,
  ]
  const changes = yield* Schema.decodeUnknownEffect(Schema.Array(SyncChange))(wire).pipe(
    Effect.mapError((cause) => new StoreError({ cause })),
  )
  yield* store.write(changes, { dirty: false })
})
