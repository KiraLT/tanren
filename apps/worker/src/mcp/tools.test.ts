import { describe, expect, it } from "@effect/vitest"
import {
  ExerciseId,
  IdGenerator,
  LOCATION_PRESETS,
  LocationId,
  MCP_TOOLS,
  OrderIndex,
  Profile,
  Reps,
  type SearchExercisesInput,
  type SearchExercisesResult,
  Session,
  SessionId,
  SetId,
  searchCatalog,
  TimeZone,
  type UserId,
  WeightKg,
  WorkoutSet,
} from "@tanren/shared"
import { DateTime, Effect, Layer, Option } from "effect"
import { TestClock } from "effect/testing"
import { ExerciseRepo, PlanRepo, ProfileRepo, Repositories, SessionRepo } from "../repos"
import { MemoryGarminImport } from "../repos/MemoryGarminImport"
import { MemoryIntegrations } from "../repos/MemoryIntegrations"
import { at, exercise, plan, userA, userB, week } from "../sync/fixtures"
import {
  DEFAULT_SEARCH_LIMIT,
  eraseTool,
  getCurrentPlan,
  getExerciseHistory,
  getOverview,
  getProfile,
  listSessions,
  readTools,
  searchExercises,
} from "./tools"
import { writeTools } from "./writeTools"

/** Every `ToolDeps` service: in-memory repos (Garmin import included) plus the counting `IdGenerator`. */
const TestLayer = Layer.mergeAll(
  MemoryGarminImport.layer.pipe(Layer.provide(MemoryIntegrations.layer)),
  IdGenerator.layerTest,
).pipe(Layer.provideMerge(Layer.merge(Repositories.layerMemory, IdGenerator.layerTest)))

const NOW = at("2026-10-20T00:00:00.000Z")
const setNow = TestClock.setTime(DateTime.toEpochMillis(NOW))
const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`

const session = (n: number, startedAt: string, userId: UserId = userA): Session =>
  Session.make({
    id: SessionId.make(id(n)),
    userId,
    createdAt: at(startedAt),
    updatedAt: at(startedAt),
    deletedAt: Option.none(),
    startedAt: at(startedAt),
    finishedAt: Option.none(),
    plannedSessionId: Option.none(),
    notes: Option.none(),
  })

const set = (
  n: number,
  owner: Session,
  exerciseN: number,
  weightKg: number,
  reps: number,
  order = 0,
): WorkoutSet =>
  WorkoutSet.make({
    id: SetId.make(id(n)),
    userId: owner.userId,
    createdAt: owner.startedAt,
    updatedAt: owner.startedAt,
    deletedAt: Option.none(),
    sessionId: owner.id,
    exerciseId: ExerciseId.make(id(exerciseN)),
    order: OrderIndex.make(order),
    weightKg: WeightKg.make(weightKg),
    reps: Reps.make(reps),
    rpe: Option.none(),
    note: Option.none(),
    plannedSetId: Option.none(),
    loggedAt: DateTime.add(owner.startedAt, { minutes: order + 1 }),
  })

// userA: squat (1), bench (2), row (3) and curl (4) over three sessions; userB: one session.
const recent = session(101, "2026-10-18T17:00:00.000Z")
const older = session(102, "2026-10-10T17:00:00.000Z")
const outside = session(103, "2026-09-01T17:00:00.000Z")
const foreign = session(104, "2026-10-19T17:00:00.000Z", userB)

const seed = Effect.gen(function* () {
  const exercises = yield* ExerciseRepo
  yield* exercises.put(userA, [
    exercise(1, { name: "Back Squat" }),
    exercise(2, { name: "Bench Press" }),
    exercise(3, { name: "Row" }),
    exercise(4, { name: "Curl" }),
  ])
  yield* exercises.put(userB, [exercise(9, { userId: userB, name: "Deadlift" })])
  const sessions = yield* SessionRepo
  yield* sessions.putSessions(userA, [recent, older, outside])
  yield* sessions.putSessions(userB, [foreign])
  yield* sessions.putSets(userA, [
    set(201, recent, 1, 100, 5, 0), // 500
    set(202, recent, 1, 100, 8, 1), // 800, best squat
    set(203, older, 1, 90, 10, 0), // 900
    set(204, older, 2, 60, 10, 1), // 600
    set(205, recent, 3, 30, 10, 2), // 300
    set(206, older, 4, 30, 10, 2), // 300, ties with row: sorted by name
    set(207, outside, 1, 200, 1, 0), // outside 30d
  ])
  yield* sessions.putSets(userB, [set(208, foreign, 9, 250, 3, 0)])
})

const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    yield* setNow
    yield* seed
    return yield* effect
  })

describe("get_overview", () => {
  it.effect("defaults to 30d ending at the clock's now", () =>
    Effect.gen(function* () {
      const overview = yield* run(getOverview.run(userA, {}))
      expect(overview.period).toBe("30d")
      expect(overview.range.to).toEqual(NOW)
      expect(overview.range.from).toEqual(at("2026-09-20T00:00:00.000Z"))
      expect([overview.sessions, overview.sets]).toEqual([2, 6])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("7d covers only the last seven days", () =>
    Effect.gen(function* () {
      const overview = yield* run(getOverview.run(userA, { period: "7d" }))
      expect(overview.range.from).toEqual(at("2026-10-13T00:00:00.000Z"))
      expect([overview.sessions, overview.sets, overview.volumeKg]).toEqual([1, 3, 1600])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("sums volume, picks the best set and sorts by volume then name", () =>
    Effect.gen(function* () {
      const overview = yield* run(getOverview.run(userA, {}))
      expect(overview.volumeKg).toBe(3400)
      expect(overview.exercises.map((e) => [e.name, e.volumeKg, e.sessions, e.sets])).toEqual([
        ["Back Squat", 2200, 2, 3],
        ["Bench Press", 600, 1, 1],
        ["Curl", 300, 1, 1],
        ["Row", 300, 1, 1],
      ])
      const squat = overview.exercises[0]
      expect(Option.map(squat?.best ?? Option.none(), (b) => [b.weightKg, b.reps])).toEqual(
        Option.some([100, 8]),
      )
      expect(squat?.lastLoggedAt).toEqual(Option.some(at("2026-10-18T17:02:00.000Z")))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("never shows another user's sessions, sets or exercises", () =>
    Effect.gen(function* () {
      const overview = yield* run(getOverview.run(userB, {}))
      expect([overview.sessions, overview.sets, overview.volumeKg]).toEqual([1, 1, 750])
      expect(overview.exercises.map((e) => e.name)).toEqual(["Deadlift"])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("reports the active plan's id, name and week count, or none", () =>
    Effect.gen(function* () {
      const none = yield* run(getOverview.run(userA, {}))
      expect(none.currentPlan).toEqual(Option.none())
      const plans = yield* PlanRepo
      yield* plans.putPlans(userA, [plan(10)])
      yield* plans.putPlanWeeks(userA, [week(20, 10), week(21, 10, "2026-10-26")])
      const some = yield* getOverview.run(userA, {})
      expect(some.currentPlan).toEqual(
        Option.some({ planId: plan(10).id, name: "Block", weeks: 2 }),
      )
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("summarises the active plan without loading it whole, ignoring archived ones", () =>
    Effect.gen(function* () {
      const plans = yield* PlanRepo
      yield* run(plans.putPlans(userA, [plan(11, "archived"), plan(10)]))
      yield* plans.putPlanWeeks(userA, [week(20, 10)])
      // `currentPlan` costs 4 D1 statements; the overview's budget is 5 in total.
      const overview = yield* getOverview
        .run(userA, {})
        .pipe(
          Effect.provideService(
            PlanRepo,
            PlanRepo.of({ ...plans, currentPlan: () => Effect.die("currentPlan was called") }),
          ),
        )
      expect(overview.currentPlan).toEqual(
        Option.some({ planId: plan(10).id, name: "Block", weeks: 1 }),
      )
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("get_exercise_history", () => {
  it.effect("groups the exercise's sets by session, newest first", () =>
    Effect.gen(function* () {
      const history = yield* run(
        getExerciseHistory.run(userA, { exerciseId: ExerciseId.make(id(1)) }),
      )
      expect(history.exercise.name).toBe("Back Squat")
      expect(history.entries.map((e) => [e.session.id, e.sets.map((s) => s.id)])).toEqual([
        [recent.id, [id(201), id(202)]],
        [older.id, [id(203)]],
        [outside.id, [id(207)]],
      ])
    }).pipe(Effect.provide(TestLayer)),
  )

  // Out-of-range limits (0, 501, 1.5) are rejected at decode: see the `call` boundary test below.
  it.effect("returns only the newest `limit` sessions", () =>
    Effect.gen(function* () {
      const exerciseId = ExerciseId.make(id(1))
      const one = yield* run(getExerciseHistory.run(userA, { exerciseId, limit: 1 }))
      expect(one.entries.map((e) => e.session.id)).toEqual([recent.id])
      const max = yield* getExerciseHistory.run(userA, { exerciseId, limit: 500 })
      expect(max.entries).toHaveLength(3)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("fails NotFound for an unknown or another user's exercise", () =>
    Effect.gen(function* () {
      const unknown = yield* Effect.flip(
        run(getExerciseHistory.run(userA, { exerciseId: ExerciseId.make(id(77)) })),
      )
      expect(unknown).toMatchObject({ _tag: "NotFound", entity: "exercise", id: id(77) })
      const foreignId = yield* Effect.flip(
        getExerciseHistory.run(userA, { exerciseId: ExerciseId.make(id(9)) }),
      )
      expect(foreignId).toMatchObject({ _tag: "NotFound", entity: "exercise", id: id(9) })
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("list_sessions", () => {
  const from = at("2026-10-10T17:00:00.000Z")
  const to = at("2026-10-18T17:00:00.000Z")

  it.effect("lists sessions in [from, to) with no sets by default", () =>
    Effect.gen(function* () {
      const list = yield* run(listSessions.run(userA, { from, to }))
      expect(list.range).toEqual({ from, to })
      expect(list.sessions.map((s) => [s.session.id, s.sets])).toEqual([[older.id, []]])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("attaches each session's sets with includeSets", () =>
    Effect.gen(function* () {
      const list = yield* run(
        listSessions.run(userA, {
          from,
          to: at("2026-10-21T00:00:00.000Z"),
          includeSets: true,
        }),
      )
      expect(list.sessions.map((s) => [s.session.id, s.sets.map((x) => x.id)])).toEqual([
        [older.id, [id(203), id(204), id(206)]],
        [recent.id, [id(201), id(202), id(205)]],
      ])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("fails ValidationError when to is before from", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(run(listSessions.run(userA, { from: to, to: from })))
      expect(error).toMatchObject({ _tag: "ValidationError" })
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("get_current_plan", () => {
  it.effect("is null without an active plan", () =>
    Effect.gen(function* () {
      expect(yield* run(getCurrentPlan.run(userA, {}))).toEqual(Option.none())
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("returns the active plan with its weeks", () =>
    Effect.gen(function* () {
      const plans = yield* PlanRepo
      yield* plans.putPlans(userA, [plan(10)])
      yield* plans.putPlanWeeks(userA, [week(20, 10)])
      const current = yield* getCurrentPlan.run(userA, {})
      expect(Option.map(current, (c) => c.plan.id)).toEqual(Option.some(plan(10).id))
      expect(Option.map(current, (c) => c.weeks.map((w) => w.id))).toEqual(
        Option.some([week(20, 10).id]),
      )
      expect(yield* getCurrentPlan.run(userB, {})).toEqual(Option.none())
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("search_exercises", () => {
  // The tool is pure (never yields a repository), so the in-memory layer only satisfies `ToolDeps`;
  // the workerd test (McpRoute.workerd.test.ts) asserts 0 D1 statements over the wire.
  const search = (input: SearchExercisesInput) =>
    searchExercises.run(userA, input).pipe(Effect.provide(TestLayer))

  it.effect("finds at least three rows for the query 'row'", () =>
    Effect.gen(function* () {
      const found = yield* search({ query: "row", limit: 500 })
      expect(found.results.length).toBeGreaterThanOrEqual(3)
      expect(found.total).toBe(found.results.length)
      expect(found.results.every((match) => /row/i.test(match.name + match.aliases.join()))).toBe(
        true,
      )
    }),
  )

  it.effect("filters by muscle (primary or secondary)", () =>
    Effect.gen(function* () {
      const found = yield* search({ muscle: "lats" })
      expect(found.results.length).toBeGreaterThan(0)
      expect(
        found.results.every(
          (match) =>
            match.primaryMuscles.includes("lats") || match.secondaryMuscles.includes("lats"),
        ),
      ).toBe(true)
    }),
  )

  it.effect("limit cuts the results but total counts every match", () =>
    Effect.gen(function* () {
      const all = yield* search({ query: "row", limit: 500 })
      const limited = yield* search({ query: "row", limit: 2 })
      expect(limited.results).toHaveLength(2)
      expect(limited.results).toEqual(all.results.slice(0, 2))
      expect(limited.total).toBe(all.total)
      expect(all.total).toBeGreaterThan(2)
    }),
  )

  it.effect("empty input returns the first 20 of the whole catalog, in order", () =>
    Effect.gen(function* () {
      const found = yield* search({})
      expect(found.results).toHaveLength(DEFAULT_SEARCH_LIMIT)
      expect(found.total).toBe(searchCatalog({}).length)
      expect(found.results.map((match) => match.catalogId)).toEqual(
        searchCatalog({}, DEFAULT_SEARCH_LIMIT).map((entry) => entry.catalogId),
      )
    }),
  )

  it.effect("a query with no match is an empty result with total 0", () =>
    Effect.gen(function* () {
      const found = yield* search({ query: "zzzzqqqq" })
      expect(found).toEqual({ results: [], total: 0 })
    }),
  )

  it.effect("call decodes raw args, rejects an unknown muscle, encodes picked fields only", () =>
    Effect.gen(function* () {
      const tool = eraseTool(searchExercises)
      const wire = yield* tool.call(userA, { query: "row", limit: 1 })
      expect(wire).toMatchObject({ results: [{ catalogId: expect.any(String) }] })
      expect(JSON.stringify(wire)).not.toContain("instructions")
      const error = yield* Effect.flip(tool.call(userA, { muscle: "wings" }))
      expect(error).toMatchObject({ _tag: "ValidationError", issues: [{ path: ["muscle"] }] })
    }).pipe(Effect.provide(TestLayer)),
  )
})

const gymId = LocationId.make(id(901))
const homeId = LocationId.make(id(902))
const profileOf = (userId: UserId, active: Option.Option<LocationId>): Profile =>
  Profile.make({
    id: userId,
    userId,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: Option.none(),
    goals: [],
    constraints: [],
    availableDays: ["mon"],
    locations: [
      { id: gymId, name: "Gym", equipment: LOCATION_PRESETS.commercialGym.equipment },
      { id: homeId, name: "Home", equipment: LOCATION_PRESETS.home.equipment },
    ],
    activeLocationId: active,
    timezone: TimeZone.make("Europe/Berlin"),
  })
const putProfile = (profile: Profile) =>
  Effect.gen(function* () {
    yield* (yield* ProfileRepo).put(profile.userId, [profile])
  })

describe("get_profile", () => {
  it.effect("is null before a profile exists", () =>
    Effect.gen(function* () {
      expect(yield* run(getProfile.run(userA, {}))).toEqual(Option.none())
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("returns the profile with its locations and encodes it for the wire", () =>
    Effect.gen(function* () {
      yield* putProfile(profileOf(userA, Option.some(gymId)))
      const profile = yield* run(getProfile.run(userA, {}))
      expect(Option.map(profile, (p) => p.locations.map((l) => l.name))).toEqual(
        Option.some(["Gym", "Home"]),
      )
      const wire = yield* eraseTool(getProfile).call(userA, {})
      expect(wire).toMatchObject({ activeLocationId: gymId, locations: [{ name: "Gym" }, {}] })
      expect(yield* run(getProfile.run(userB, {}))).toEqual(Option.none())
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("is null for a tombstoned profile", () =>
    Effect.gen(function* () {
      yield* putProfile(
        Profile.make({ ...profileOf(userA, Option.some(gymId)), deletedAt: Option.some(NOW) }),
      )
      expect(yield* run(getProfile.run(userA, {}))).toEqual(Option.none())
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("search_exercises availableAt", () => {
  const MACHINES = ["legPress", "chestPressMachine"]
  const needsMachine = (found: SearchExercisesResult) =>
    found.results.filter((match) => match.equipment.some((tag) => MACHINES.includes(tag)))

  it.effect("active = the active location's equipment (Gym keeps the leg press)", () =>
    Effect.gen(function* () {
      yield* putProfile(profileOf(userA, Option.some(gymId)))
      const found = yield* run(
        searchExercises.run(userA, { query: "press", availableAt: "active" }),
      )
      expect(found.results.length).toBeGreaterThan(0)
      expect(needsMachine(found).length).toBeGreaterThan(0)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("a Home id drops every machine press and keeps only what Home covers", () =>
    Effect.gen(function* () {
      yield* putProfile(profileOf(userA, Option.some(gymId)))
      const found = yield* run(
        searchExercises.run(userA, { query: "press", availableAt: homeId, limit: 500 }),
      )
      expect(found.results.length).toBeGreaterThan(0)
      expect(needsMachine(found)).toEqual([])
      const home: ReadonlyArray<string> = LOCATION_PRESETS.home.equipment
      expect(found.results.every((m) => m.equipment.every((tag) => home.includes(tag)))).toBe(true)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("active without an active location filters nothing", () =>
    Effect.gen(function* () {
      yield* putProfile(profileOf(userA, Option.none()))
      const filtered = yield* run(
        searchExercises.run(userA, { query: "press", availableAt: "active" }),
      )
      const all = yield* run(searchExercises.run(userA, { query: "press" }))
      expect(filtered).toEqual(all)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("active without a profile filters nothing", () =>
    Effect.gen(function* () {
      const filtered = yield* run(
        searchExercises.run(userB, { query: "row", availableAt: "active" }),
      )
      expect(filtered.total).toBe(searchCatalog({ query: "row" }).length)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("an id that is not one of the profile's locations is NotFound location", () =>
    Effect.gen(function* () {
      yield* putProfile(profileOf(userA, Option.some(gymId)))
      const unknown = LocationId.make(id(903))
      const error = yield* Effect.flip(searchExercises.run(userA, { availableAt: unknown }))
      expect(error).toMatchObject({ _tag: "NotFound", entity: "location", id: unknown })
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("ignores a tombstoned profile: active filters nothing, a location id is NotFound", () =>
    Effect.gen(function* () {
      yield* putProfile(
        Profile.make({ ...profileOf(userA, Option.some(homeId)), deletedAt: Option.some(NOW) }),
      )
      const filtered = yield* run(
        searchExercises.run(userA, { query: "press", availableAt: "active" }),
      )
      expect(filtered).toEqual(yield* run(searchExercises.run(userA, { query: "press" })))
      const error = yield* Effect.flip(searchExercises.run(userA, { availableAt: homeId }))
      expect(error).toMatchObject({ _tag: "NotFound", entity: "location", id: homeId })
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("readTools", () => {
  it("lists the six read tools in MCP_TOOLS order", () => {
    expect(readTools.map((tool) => tool.name)).toEqual(MCP_TOOLS.slice(0, 6))
  })

  it("marks every read tool read and every write tool write", () => {
    expect(readTools.every((tool) => tool.kind === "read")).toBe(true)
    expect(writeTools.every((tool) => tool.kind === "write")).toBe(true)
  })

  it.effect("call decodes raw args and returns the JSON wire form", () =>
    Effect.gen(function* () {
      const [overview] = readTools
      const wire = yield* run(overview?.call(userA, { period: "7d" }) ?? Effect.die("no tool"))
      expect(wire).toMatchObject({
        period: "7d",
        range: { from: "2026-10-13T00:00:00.000Z", to: "2026-10-20T00:00:00.000Z" },
        volumeKg: 1600,
        currentPlan: null,
      })
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("call fails ValidationError on malformed args", () =>
    Effect.gen(function* () {
      const history = readTools[1]
      const error = yield* Effect.flip(
        history?.call(userA, { exerciseId: "not-a-uuid", limit: 0 }) ?? Effect.die("no tool"),
      )
      expect(error).toMatchObject({ _tag: "ValidationError" })
    }).pipe(Effect.provide(TestLayer)),
  )
})

// QA break tests: tombstones, cross-user isolation and boundary inputs.
describe("QA: tombstones and isolation", () => {
  const gone = at("2026-10-19T00:00:00.000Z")
  const deadSession = Session.make({
    ...session(111, "2026-10-17T17:00:00.000Z"),
    deletedAt: Option.some(gone),
  })
  const liveSession = session(112, "2026-10-17T18:00:00.000Z")
  const deadSet = WorkoutSet.make({
    ...set(211, liveSession, 1, 500, 5, 0),
    deletedAt: Option.some(gone),
  })
  const orphanSet = set(212, deadSession, 1, 700, 5, 0) // live set under a tombstoned session

  const seedTombstones = Effect.gen(function* () {
    const sessions = yield* SessionRepo
    yield* sessions.putSessions(userA, [deadSession, liveSession])
    yield* sessions.putSets(userA, [deadSet, orphanSet, set(213, liveSession, 1, 10, 10, 1)])
  })

  it.effect("a tombstoned set or session is never counted or listed", () =>
    Effect.gen(function* () {
      yield* seedTombstones
      const overview = yield* getOverview.run(userA, { period: "30d" })
      // base seed: 7d.. 30d has recent+older (6 sets, 3400 kg) + the one live set (100 kg)
      expect(overview.sessions).toBe(3)
      expect(overview.sets).toBe(7)
      expect(overview.volumeKg).toBe(3500)
      const list = yield* listSessions.run(userA, {
        from: at("2026-10-17T00:00:00.000Z"),
        to: at("2026-10-18T00:00:00.000Z"),
        includeSets: true,
      })
      expect(list.sessions.map((s) => [s.session.id, s.sets.map((x) => x.id)])).toEqual([
        [liveSession.id, [id(213)]],
      ])
      const history = yield* getExerciseHistory.run(userA, { exerciseId: ExerciseId.make(id(1)) })
      const ids = history.entries.flatMap((e) => e.sets.map((x) => x.id))
      expect(ids).not.toContain(id(211))
      expect(ids).not.toContain(id(212))
      expect(history.entries.map((e) => e.session.id)).not.toContain(deadSession.id)
    }).pipe(run, Effect.provide(TestLayer)),
  )

  it.effect(
    "list_sessions includeSets over a range holding two users shows only the caller's",
    () =>
      Effect.gen(function* () {
        const range = {
          from: at("2026-10-01T00:00:00.000Z"),
          to: at("2026-10-21T00:00:00.000Z"),
          includeSets: true,
        }
        const a = yield* listSessions.run(userA, range)
        const b = yield* listSessions.run(userB, range)
        const flat = (l: typeof a) => l.sessions.flatMap((s) => s.sets.map((x) => x.id))
        expect(flat(a)).not.toContain(id(208))
        expect(a.sessions.map((s) => s.session.userId)).toEqual([userA, userA])
        expect(b.sessions.map((s) => s.session.id)).toEqual([foreign.id])
        expect(flat(b)).toEqual([id(208)])
        const ov = yield* getOverview.run(userB, { period: "7d" })
        expect(ov.exercises.map((x) => x.name)).toEqual(["Deadlift"])
        expect(ov.volumeKg).toBe(750)
      }).pipe(run, Effect.provide(TestLayer)),
  )

  it.effect(
    "boundary args through call: bad period, non-ISO dates, limit 0/501/1.5 are ValidationErrors",
    () =>
      Effect.gen(function* () {
        const [overview, history, sessions] = readTools
        const bad = (tool: typeof overview, args: unknown) =>
          Effect.flip(tool?.call(userA, args) ?? Effect.die("no tool"))
        const ex = id(1)
        const errors = [
          yield* bad(overview, { period: "1y" }),
          yield* bad(overview, { period: 7 }),
          yield* bad(history, { exerciseId: ex, limit: 0 }),
          yield* bad(history, { exerciseId: ex, limit: 501 }),
          yield* bad(history, { exerciseId: ex, limit: 1.5 }),
          yield* bad(history, { exerciseId: ex, limit: -1 }),
          yield* bad(history, { exerciseId: ex, limit: "5" }),
          yield* bad(sessions, { from: "yesterday", to: "2026-10-20T00:00:00.000Z" }),
          yield* bad(sessions, { from: "2026-10-20", to: "2026-10-21" }),
          yield* bad(sessions, { to: "2026-10-20T00:00:00.000Z" }),
          yield* bad(sessions, {
            from: "2026-10-20T00:00:00.000Z",
            to: "2026-10-21T00:00:00.000Z",
            includeSets: "yes",
          }),
        ]
        expect(errors.map((error) => error._tag)).toEqual(errors.map(() => "ValidationError"))
      }).pipe(run, Effect.provide(TestLayer)),
  )

  it.effect(
    "get_overview with no args and with an empty object default to 30d; limit 500 is accepted",
    () =>
      Effect.gen(function* () {
        const [overview, history] = readTools
        const none = yield* overview?.call(userA, {}) ?? Effect.die("no tool")
        expect(none).toMatchObject({ period: "30d" })
        const max = yield* history?.call(userA, { exerciseId: id(1), limit: 500 }) ??
          Effect.die("x")
        expect(max).toMatchObject({ exercise: { name: "Back Squat" } })
        const empty = yield* listSessions.run(userA, { from, to: from })
        expect(empty.sessions).toEqual([])
      }).pipe(run, Effect.provide(TestLayer)),
  )

  it.effect("a tombstoned exercise's id is still readable but a foreign id is NotFound", () =>
    Effect.gen(function* () {
      const foreignEx = yield* Effect.flip(
        getExerciseHistory.run(userA, { exerciseId: ExerciseId.make(id(9)) }),
      )
      expect(foreignEx).toMatchObject({ _tag: "NotFound" })
      expect(JSON.stringify(foreignEx)).not.toContain("Deadlift")
    }).pipe(run, Effect.provide(TestLayer)),
  )
})
const from = at("2026-10-10T17:00:00.000Z")
