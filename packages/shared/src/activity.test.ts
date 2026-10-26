import { describe, expect, it } from "@effect/vitest"
import { DateTime, Effect, Option, Schema } from "effect"
import {
  ACTIVITY_OPEN_WINDOW_MS,
  Activity,
  type BuildActivityInput,
  bestSet,
  buildActivity,
  epley1Rm,
  markPrs,
  type ScoredSet,
  SetScore,
} from "./activity"
import { CatalogId } from "./catalog"
import { Label, OrderIndex, Reps, WeightKg } from "./common"
import { Exercise } from "./exercise"
import { ExerciseId, SessionId, SetId, UserId } from "./ids"
import { DayNumber, ProgramId } from "./programs"
import { Session, WorkoutSet } from "./session"
import { failingPaths, roundTrips, wireRoundTrips } from "./testing"

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const userId = UserId.make(uid(1))
const sessionId = SessionId.make(uid(2))
const STAMP = DateTime.makeUnsafe("2026-10-19T07:00:00.000Z")
const START = DateTime.makeUnsafe("2026-10-19T08:00:00.000Z")
const at = (minutes: number, seconds = 0) =>
  DateTime.makeUnsafe(Date.UTC(2026, 9, 19, 8, minutes, seconds))

// --- fixtures --------------------------------------------------------------------------------

const exercise = (n: number, name: string, catalogId: string | null, muscleGroups: string[]) =>
  new Exercise({
    id: ExerciseId.make(uid(n)),
    userId,
    createdAt: STAMP,
    updatedAt: STAMP,
    deletedAt: Option.none(),
    name: Label.make(name),
    aliases: [],
    muscleGroups: Schema.decodeUnknownSync(Exercise.fields.muscleGroups)(muscleGroups),
    notes: Option.none(),
    catalogId: Option.fromNullishOr(catalogId).pipe(Option.map((id) => CatalogId.make(id))),
  })

const BENCH = exercise(10, "Bench", "barbell-bench-press", [])
const PULLUP = exercise(11, "Pull-up", "pull-up", [])
const DEADBUG = exercise(12, "Dead bug", "dead-bug", [])
const PUSHUP = exercise(13, "Push-up", "push-up", [])
const CUSTOM = exercise(14, "Odd Squat", null, ["quads", "glutes"])
// A catalog id the catalog does not know falls back to the exercise's own muscleGroups.
const STALE = exercise(15, "Stale link", "no-such-catalog-entry", ["calves"])

const exercises = (...list: ReadonlyArray<Exercise>): ReadonlyMap<string, Exercise> =>
  new Map(list.map((e) => [e.id, e] as const))

/** Set ids derive from (exercise, second logged): unique per set in these fixtures, no counter. */
const wset = (
  exerciseId: string,
  weight: number,
  reps: number,
  loggedAt: DateTime.Utc,
  isPr = false,
) => {
  return {
    ...new WorkoutSet({
      id: SetId.make(
        uid(
          Number(exerciseId.slice(-12)) * 100_000 +
            (Math.floor(DateTime.toEpochMillis(loggedAt) / 1000) % 100_000),
        ),
      ),
      userId,
      createdAt: STAMP,
      updatedAt: STAMP,
      deletedAt: Option.none(),
      sessionId,
      exerciseId: ExerciseId.make(exerciseId),
      order: OrderIndex.make(0),
      weightKg: WeightKg.make(weight),
      reps: Reps.make(reps),
      rpe: Option.none(),
      note: Option.none(),
      plannedSetId: Option.none(),
      loggedAt,
    }),
    isPr,
  }
}

const session = (finishedAt: Option.Option<DateTime.Utc> = Option.none()) =>
  new Session({
    id: sessionId,
    userId,
    createdAt: STAMP,
    updatedAt: STAMP,
    deletedAt: Option.none(),
    startedAt: START,
    finishedAt,
    plannedSessionId: Option.none(),
    notes: Option.none(),
  })

const input = (overrides: Partial<BuildActivityInput> = {}): BuildActivityInput => ({
  session: session(),
  sets: [wset(BENCH.id, 80, 8, at(1)), wset(BENCH.id, 85, 8, at(5))],
  exercises: exercises(BENCH),
  plannedTitle: Option.none(),
  program: Option.none(),
  now: at(10),
  ...overrides,
})

const built = (overrides: Partial<BuildActivityInput> = {}): Activity => {
  const result = buildActivity(input(overrides))
  expect(Option.isSome(result)).toBe(true)
  return Option.getOrThrow(result)
}

// --- buildActivity ---------------------------------------------------------------------------

describe("buildActivity", () => {
  it("returns None for a session with no sets", () => {
    expect(buildActivity(input({ sets: [] }))).toEqual(Option.none())
  })

  it("title: program beats planned beats free", () => {
    const program = Option.some({
      programId: ProgramId.make("core-30"),
      dayNumber: DayNumber.make(12),
    })
    const planned = Option.some(Label.make("Push day"))
    expect(built({ program, plannedTitle: planned })).toMatchObject({
      kind: "program",
      title: "Core 30 · Day 12",
    })
    expect(built({ plannedTitle: planned })).toMatchObject({ kind: "planned", title: "Push day" })
    expect(built()).toMatchObject({ kind: "free", title: "Workout" })
  })

  it("an unknown program id titles as 'Program · Day n'", () => {
    const program = Option.some({
      programId: ProgramId.make("gone-program"),
      dayNumber: DayNumber.make(3),
    })
    expect(built({ program })).toMatchObject({ kind: "program", title: "Program · Day 3" })
  })

  it("duration: from finishedAt, from first and last set, None for a single set", () => {
    expect(built({ session: session(Option.some(at(48))) }).durationSeconds).toEqual(
      Option.some(48 * 60),
    )
    expect(built().durationSeconds).toEqual(Option.some(4 * 60)) // at(1) → at(5)
    expect(built({ sets: [wset(BENCH.id, 80, 8, at(1))] }).durationSeconds).toEqual(Option.none())
  })

  it("durationSeconds is zero when finishedAt is before startedAt (clock skew)", () => {
    const before = DateTime.makeUnsafe(Date.UTC(2026, 9, 19, 7, 59, 0))
    // The Session schema rejects this order, so build it unchecked (what a skewed row would be).
    const skewed = new Session(
      { ...session(), finishedAt: Option.some(before) },
      { disableChecks: true },
    )
    expect(built({ session: skewed }).durationSeconds).toEqual(Option.some(0))
  })

  it("durationSeconds floors to whole seconds", () => {
    const finished = DateTime.makeUnsafe(Date.UTC(2026, 9, 19, 8, 0, 59, 999))
    expect(built({ session: session(Option.some(finished)) }).durationSeconds).toEqual(
      Option.some(59),
    )
    const sets = [
      wset(BENCH.id, 80, 8, at(1)),
      wset(BENCH.id, 80, 8, DateTime.makeUnsafe(Date.UTC(2026, 9, 19, 8, 1, 30, 999))),
    ]
    expect(built({ sets }).durationSeconds).toEqual(Option.some(30))
  })

  it("status: inProgress at 11 h 59 m, done at 12 h, done when finished", () => {
    const justUnder = DateTime.makeUnsafe(
      DateTime.toEpochMillis(START) + ACTIVITY_OPEN_WINDOW_MS - 60_000,
    )
    const exactly = DateTime.makeUnsafe(DateTime.toEpochMillis(START) + ACTIVITY_OPEN_WINDOW_MS)
    expect(built({ now: justUnder }).status).toBe("inProgress")
    expect(built({ now: exactly }).status).toBe("done")
    expect(built({ session: session(Option.some(at(30))), now: at(31) }).status).toBe("done")
  })

  it("totals: sets, reps, volume and PR count", () => {
    const activity = built({
      sets: [
        wset(BENCH.id, 80, 8, at(1)),
        wset(BENCH.id, 85, 8, at(5), true),
        wset(PULLUP.id, 0, 10, at(9), true),
      ],
      exercises: exercises(BENCH, PULLUP),
    })
    expect(activity).toMatchObject({ sets: 3, reps: 26, volumeKg: 80 * 8 + 85 * 8, prs: 2 })
  })

  it("exercises: ordered by first set, sets chronological, best and prs per exercise", () => {
    const activity = built({
      // Given out of order on purpose.
      sets: [
        wset(PULLUP.id, 0, 6, at(6)),
        wset(BENCH.id, 85, 8, at(5), true),
        wset(PULLUP.id, 0, 9, at(3)),
        wset(BENCH.id, 80, 8, at(1)),
      ],
      exercises: exercises(BENCH, PULLUP),
    })
    expect(activity.exercises.map((e) => e.name)).toEqual(["Bench", "Pull-up"])
    const [bench, pullup] = activity.exercises
    expect(bench?.sets.map((s) => s.weightKg)).toEqual([80, 85])
    expect(bench).toMatchObject({ best: { weightKg: 85, reps: 8 }, prs: 1 })
    expect(pullup?.sets.map((s) => s.reps)).toEqual([9, 6])
    expect(pullup).toMatchObject({ best: { weightKg: 0, reps: 9 }, prs: 0 })
  })

  it("an exercise missing from the map is kept as 'Unknown exercise' and still counts", () => {
    const stranger = uid(99)
    const activity = built({
      sets: [wset(BENCH.id, 80, 8, at(1)), wset(stranger, 20, 10, at(2), true)],
      exercises: exercises(BENCH),
    })
    expect(activity).toMatchObject({ sets: 2, reps: 18, prs: 1 })
    expect(activity.exercises.map((e) => e.name)).toEqual(["Bench", "Unknown exercise"])
    expect(activity.exercises[1]?.catalogId).toEqual(Option.none())
    expect(activity.exercises[1]?.muscleGroups).toEqual([])
    // No muscles from an exercise nobody knows.
    expect(activity.muscles).toEqual({ primary: ["chest", "triceps"], secondary: ["shoulders"] })
  })

  it("muscles: a secondary that is primary elsewhere ends up primary only, sorted by literal order", () => {
    const activity = built({
      sets: [
        wset(DEADBUG.id, 0, 12, at(1)),
        wset(PULLUP.id, 0, 6, at(2)),
        wset(BENCH.id, 80, 8, at(3)),
      ],
      exercises: exercises(BENCH, PULLUP, DEADBUG),
    })
    // pull-up lists core as secondary; dead-bug has it as primary.
    expect(activity.muscles.primary).toEqual(["chest", "lats", "upperBack", "triceps", "core"])
    expect(activity.muscles.secondary).toEqual(["shoulders", "biceps", "forearms"])
    expect(activity.muscles.secondary).not.toContain("core")
  })

  it("an exercise without catalogId contributes its muscleGroups as primary", () => {
    const activity = built({
      sets: [wset(CUSTOM.id, 60, 8, at(1)), wset(PUSHUP.id, 0, 15, at(2))],
      exercises: exercises(CUSTOM, PUSHUP),
    })
    expect(activity.muscles.primary).toEqual(["chest", "triceps", "quads", "glutes"])
    expect(activity.muscles.secondary).toEqual(["shoulders", "core"])
  })

  it("each exercise carries its row's muscleGroups (a custom one draws its own map)", () => {
    const activity = built({
      sets: [wset(CUSTOM.id, 60, 8, at(1)), wset(BENCH.id, 80, 8, at(2))],
      exercises: exercises(CUSTOM, BENCH),
    })
    expect(activity.exercises[0]).toMatchObject({
      catalogId: Option.none(),
      muscleGroups: ["quads", "glutes"],
    })
    expect(activity.exercises[1]?.muscleGroups).toEqual([])
  })

  it("a catalogId the catalog does not know falls back to muscleGroups as primary", () => {
    const activity = built({
      sets: [wset(STALE.id, 40, 12, at(1))],
      exercises: exercises(STALE),
    })
    expect(activity.muscles).toEqual({ primary: ["calves"], secondary: [] })
  })

  it("carries the program link and the session start through", () => {
    const program = Option.some({
      programId: ProgramId.make("core-30"),
      dayNumber: DayNumber.make(1),
    })
    const activity = built({ program })
    expect(activity.program).toEqual(program)
    expect(activity.sessionId).toBe(sessionId)
    expect(DateTime.toEpochMillis(activity.startedAt)).toBe(DateTime.toEpochMillis(START))
  })
})

// --- Activity schema -------------------------------------------------------------------------

describe("Activity schema", () => {
  const sample = built({
    sets: [
      wset(BENCH.id, 80, 8, at(1)),
      wset(BENCH.id, 85, 8, at(5), true),
      wset(PULLUP.id, 0, 6, at(9)),
      wset(CUSTOM.id, 60, 8, at(12)),
    ],
    exercises: exercises(BENCH, PULLUP, CUSTOM),
    plannedTitle: Option.some(Label.make("Push day")),
    session: session(Option.some(at(40))),
  })

  it.effect("round-trips encode ∘ decode", () => roundTrips(Activity, sample))

  it.effect("encodes Options as null and timestamps as ISO strings", () =>
    Effect.gen(function* () {
      const wire = yield* Schema.encodeEffect(Activity)(sample)
      expect(wire).toMatchObject({
        kind: "planned",
        status: "done",
        startedAt: "2026-10-19T08:00:00.000Z",
        durationSeconds: 2400,
        program: null,
      })
      yield* wireRoundTrips(Activity, wire)
    }),
  )

  it.effect("a bad kind fails at its path", () =>
    Effect.gen(function* () {
      const wire = yield* Schema.encodeEffect(Activity)(sample)
      expect(yield* failingPaths(Activity, { ...wire, kind: "workout" })).toEqual([["kind"]])
    }),
  )

  it.effect("a fractional set count fails at its path (Schema.Int)", () =>
    Effect.gen(function* () {
      const wire = yield* Schema.encodeEffect(Activity)(sample)
      expect(yield* failingPaths(Activity, { ...wire, sets: 1.5 })).toEqual([["sets"]])
    }),
  )

  it.effect("a bad muscle group fails at its nested path", () =>
    Effect.gen(function* () {
      const wire = yield* Schema.encodeEffect(Activity)(
        built({
          sets: [wset(CUSTOM.id, 60, 8, at(1))],
          exercises: exercises(CUSTOM),
        }),
      )
      expect(wire.exercises[0]?.muscleGroups).toEqual(["quads", "glutes"])
      const first = wire.exercises[0]
      const broken = {
        ...wire,
        exercises: [{ ...first, muscleGroups: ["elbows", "glutes"] }, ...wire.exercises.slice(1)],
      }
      expect(yield* failingPaths(Activity, broken)).toEqual([["exercises", 0, "muscleGroups", 0]])
    }),
  )

  it.effect("a bad nested set weight fails at its nested path", () =>
    Effect.gen(function* () {
      const wire = yield* Schema.encodeEffect(Activity)(sample)
      const first = wire.exercises[0]
      const broken = {
        ...wire,
        exercises: [
          { ...first, sets: [{ ...first?.sets[0], weightKg: 80.1 }] },
          ...wire.exercises.slice(1),
        ],
      }
      expect(yield* failingPaths(Activity, broken)).toEqual([
        ["exercises", 0, "sets", 0, "weightKg"],
      ])
    }),
  )
})

// --- PR math (moved from apps/mobile/src/services/progressMath) ------------------------------

const set = (id: string, weightKg: number, reps: number, minute = 0): ScoredSet => ({
  id,
  weightKg,
  reps,
  loggedAt: DateTime.makeUnsafe(Date.UTC(2026, 9, 19, 8, minute)),
})

describe("epley1Rm", () => {
  it("estimates w * (1 + reps / 30), with the one-rep and zero edge cases", () => {
    expect(epley1Rm(100, 5)).toBeCloseTo(116.67, 2)
    expect(epley1Rm(100, 1)).toBe(100)
    expect(epley1Rm(0, 12)).toBe(0)
    expect(epley1Rm(80, 0)).toBe(0)
  })
})

describe("SetScore", () => {
  it("ranks by e1RM, then reps, then weight; bodyweight sets by reps", () => {
    expect(SetScore({ weightKg: 100, reps: 8 }, { weightKg: 105, reps: 5 })).toBe(1)
    expect(SetScore({ weightKg: 100, reps: 5 }, { weightKg: 100, reps: 5 })).toBe(0)
    expect(SetScore({ weightKg: 0, reps: 10 }, { weightKg: 0, reps: 8 })).toBe(1)
    expect(SetScore({ weightKg: 0, reps: 8 }, { weightKg: 0, reps: 10 })).toBe(-1)
    // Equal e1RM (both 0 because reps 0): reps tie, so weight decides.
    expect(SetScore({ weightKg: 50, reps: 0 }, { weightKg: 40, reps: 0 })).toBe(1)
  })

  it("bestSet keeps the earliest of equal sets", () => {
    const best = bestSet([set("a", 100, 5), set("b", 100, 5, 1), set("c", 90, 5, 2)])
    expect(best).toMatchObject({ _tag: "Some", value: { id: "a" } })
    expect(bestSet([])._tag).toBe("None")
  })
})

describe("markPrs", () => {
  it("never marks the first set, not an equal best, only a strict beat", () => {
    const marked = markPrs([
      set("first", 100, 5, 0),
      set("equal", 100, 5, 1),
      set("lighter", 90, 5, 2),
      set("beat", 100, 6, 3),
      set("again", 100, 6, 4),
    ])
    expect(marked.map((s) => [s.id, s.isPr])).toEqual([
      ["first", false],
      ["equal", false],
      ["lighter", false],
      ["beat", true],
      ["again", false],
    ])
  })

  it("keeps the input fields and handles empty input", () => {
    expect(markPrs([set("x", 0, 8)])[0]).toMatchObject({ id: "x", reps: 8, isPr: false })
    expect(markPrs([])).toEqual([])
  })
})

describe("PR edge cases", () => {
  it("60 kg x 1 then 30 kg x 30 have equal e1RM, and the extra reps make the second a PR", () => {
    expect(epley1Rm(60, 1)).toBe(epley1Rm(30, 30))
    const marked = markPrs([set("a", 60, 1, 0), set("b", 30, 30, 1)])
    expect(marked.map((s) => s.isPr)).toEqual([false, true])
  })

  it("the same pair in the other order is not a PR (fewer reps at equal e1RM)", () => {
    const marked = markPrs([set("a", 30, 30, 0), set("b", 60, 1, 1)])
    expect(marked.map((s) => s.isPr)).toEqual([false, false])
  })

  it("bodyweight-only history: more reps is a PR, equal reps is not, bestSet is the max reps", () => {
    const sets = [set("a", 0, 8, 0), set("b", 0, 8, 1), set("c", 0, 12, 2)]
    expect(markPrs(sets).map((s) => s.isPr)).toEqual([false, false, true])
    expect(Option.map(bestSet(sets), (s) => s.id)).toEqual(Option.some("c"))
  })

  it("added weight on a bodyweight exercise beats any bodyweight set of equal reps", () => {
    const marked = markPrs([set("a", 0, 10, 0), set("b", 5, 10, 1)])
    expect(marked.map((s) => s.isPr)).toEqual([false, true])
  })

  it("empty input and a lone zero-rep set do not throw and mark no PR", () => {
    expect(markPrs([])).toEqual([])
    expect(markPrs([set("a", 100, 0, 0)]).map((s) => s.isPr)).toEqual([false])
    expect(Option.isNone(bestSet([]))).toBe(true)
  })

  it("epley1Rm is 0 for negative weight, negative reps and NaN-free for zero", () => {
    expect([epley1Rm(-5, 5), epley1Rm(50, -1), epley1Rm(0, 0), epley1Rm(0, 5)]).toEqual([
      0, 0, 0, 0,
    ])
  })
})
