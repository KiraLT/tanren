import { describe, expect, it } from "@effect/vitest"
import { PersistenceError, UserProgramRepo } from "@tanren/db"
import {
  CATALOG,
  CatalogId,
  DeleteProgramInput,
  EnrollProgramInput,
  findCatalogExercise,
  GetProgramInput,
  GetProgramProgressInput,
  IdGenerator,
  ListProgramsInput,
  ProgramEnrollment,
  ProgramId,
  SetEnrollmentStatusInput,
  SwapExerciseInput,
  swapCandidates,
  UpdateProgramInput,
  type UserId,
  UserProgram,
  WriteProgramInput,
} from "@tanren/shared"
import { Array as Arr, DateTime, Effect, Layer, Option, Ref, Schema } from "effect"
import { TestClock } from "effect/testing"
import { Repositories } from "../repos"
import { MemoryGarminImport } from "../repos/MemoryGarminImport"
import { MemoryIntegrations } from "../repos/MemoryIntegrations"
import { at, userA, userB } from "../sync/fixtures"
import {
  deleteProgram,
  enrollProgram,
  getProgram,
  getProgramProgress,
  listPrograms,
  programReadTools,
  programWriteTools,
  setEnrollmentStatus,
  swapExercise,
  updateProgram,
  writeProgram,
} from "./programTools"

// Thursday 2026-10-29 in UTC (no profile → UTC).
const NOW = at("2026-10-29T10:00:00.000Z")
/** Every `ToolDeps` service: in-memory repos (Garmin import included) plus the counting `IdGenerator`. */
const layer = MemoryGarminImport.layer.pipe(
  Layer.provide(MemoryIntegrations.layer),
  Layer.provideMerge(Layer.merge(Repositories.layerMemory, IdGenerator.layerTest)),
)
const setup = TestClock.setTime(DateTime.toEpochMillis(NOW))

const reps = (catalogId: string, count = 15) => ({
  kind: "reps",
  catalogId,
  reps: count,
  restSeconds: 20,
})
const timed = (catalogId: string, seconds = 40) => ({
  kind: "timed",
  catalogId,
  seconds,
  restSeconds: 20,
})
const day = (items: ReadonlyArray<unknown>, rounds = 2) => ({
  title: "Core",
  rounds,
  items,
  restBetweenRoundsSeconds: 60,
})
const program = (days: ReadonlyArray<unknown>, slug = "my-core") => ({
  slug,
  title: "My Core",
  summary: "Three short core days",
  schedule: { kind: "daysPerWeek", days: 3 },
  days,
})
const written = (body: unknown) => Schema.decodeUnknownSync(WriteProgramInput)(body)
const THREE_DAYS = [
  day([reps("crunch"), timed("plank")]),
  day([reps("dead-bug"), timed("side-plank")]),
  day([reps("glute-bridge")]),
]
const decode =
  <S extends Schema.Decoder<unknown>>(schema: S) =>
  (body: unknown): S["Type"] =>
    Schema.decodeUnknownSync(schema)(body)

const update = decode(UpdateProgramInput)
const enroll = decode(EnrollProgramInput)
const status = decode(SetEnrollmentStatusInput)
const swap = decode(SwapExerciseInput)
const del = decode(DeleteProgramInput)
const progress = decode(GetProgramProgressInput)
const one = decode(GetProgramInput)

describe("write_program", () => {
  it.effect("creates a row, then replaces it by slug keeping the id and bumping the version", () =>
    Effect.gen(function* () {
      yield* setup
      const first = yield* writeProgram.run(userA, written(program(THREE_DAYS)))
      expect([first.created, first.version, first.days]).toEqual([true, 1, 3])
      expect(first.minutesPerDay.min).toBeLessThanOrEqual(first.minutesPerDay.max)
      const second = yield* writeProgram.run(
        userA,
        written({ ...program(THREE_DAYS.slice(0, 2)), title: "My Core v2" }),
      )
      expect(second.programId).toBe(first.programId)
      expect([second.created, second.version, second.days]).toEqual([false, 2, 2])
      const rows = yield* (yield* UserProgramRepo).list(userA)
      expect(rows.map((row) => [row.title, row.version, row.source])).toEqual([
        ["My Core v2", 2, "mcp"],
      ])
    }).pipe(Effect.provide(layer)),
  )

  it.effect("names the first unknown catalog id as NotFound catalogExercise", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        writeProgram.run(
          userA,
          written(program([day([reps("crunch")]), day([reps("made-up-move")])])),
        ),
      )
      expect(error).toMatchObject({
        _tag: "NotFound",
        entity: "catalogExercise",
        id: "made-up-move",
      })
      expect(yield* (yield* UserProgramRepo).list(userA)).toEqual([])
    }).pipe(Effect.provide(layer)),
  )

  it.effect("refuses a built-in slug as Forbidden", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        writeProgram.run(userA, written(program(THREE_DAYS, "core-30"))),
      )
      expect(error).toMatchObject({ _tag: "Forbidden", message: "built-in programs are read-only" })
    }).pipe(Effect.provide(layer)),
  )

  it.effect("warns for a day over 45 min, a repeated id and a timed exercise used as reps", () =>
    Effect.gen(function* () {
      const long = day(
        Arr.makeBy(12, () => reps("crunch", 100)),
        5,
      )
      const result = yield* writeProgram.run(
        userA,
        written(program([long, day([reps("plank", 10)])])),
      )
      expect(result.warnings.filter((w) => w.startsWith("day 1 runs"))).toHaveLength(1)
      expect(result.warnings.find((w) => w.startsWith("day 1 runs"))).toMatch(
        /^day 1 runs \d+ min \(> 45\)$/,
      )
      expect(result.warnings).toContain("day 1 repeats crunch")
      expect(result.warnings).toContain("plank is a timed exercise used as reps")
    }).pipe(Effect.provide(layer)),
  )

  it.effect("warns for a reps exercise used as timed", () =>
    Effect.gen(function* () {
      const result = yield* writeProgram.run(userA, written(program([day([timed("crunch", 30)])])))
      expect(result.warnings).toEqual(["crunch is a reps exercise used as timed"])
    }).pipe(Effect.provide(layer)),
  )

  it.effect("warns for an enrollment past the new day count", () =>
    Effect.gen(function* () {
      yield* setup
      const repo = yield* UserProgramRepo
      const created = yield* writeProgram.run(userA, written(program(THREE_DAYS)))
      const { enrollment } = yield* enrollProgram.run(
        userA,
        enroll({ programId: created.programId }),
      )
      const stored = Arr.findFirstWithIndex(
        yield* repo.enrollments(userA),
        (row) => row.id === enrollment.enrollmentId,
      )
      expect(Option.isSome(stored)).toBe(true)
      if (Option.isSome(stored)) {
        yield* repo.putEnrollment(
          userA,
          yield* ProgramEnrollment.makeEffect({ ...stored.value[0], currentDay: 3 }),
        )
      }
      const shorter = yield* writeProgram.run(userA, written(program(THREE_DAYS.slice(0, 2))))
      expect(shorter.warnings).toEqual([
        `enrollment ${enrollment.enrollmentId} is on day 3 > days (2): the app shows the program as finished`,
      ])
    }).pipe(Effect.provide(layer)),
  )
})

describe("update_program", () => {
  it.effect("patches the given fields, keeps the rest, bumps the version", () =>
    Effect.gen(function* () {
      const created = yield* writeProgram.run(userA, written(program(THREE_DAYS)))
      const result = yield* updateProgram.run(
        userA,
        update({ programId: created.programId, title: "Renamed" }),
      )
      expect([result.programId, result.version, result.days]).toEqual([created.programId, 2, 3])
      const detail = yield* getProgram.run(userA, one({ programId: created.programId }))
      expect(detail.program.name).toBe("Renamed")
      expect(detail.program.tagline).toBe("Three short core days")
      expect(detail.program.days).toHaveLength(3)
    }).pipe(Effect.provide(layer)),
  )

  it.effect("rejects an empty patch", () =>
    Effect.gen(function* () {
      const created = yield* writeProgram.run(userA, written(program(THREE_DAYS)))
      const error = yield* Effect.flip(
        updateProgram.run(userA, update({ programId: created.programId })),
      )
      expect(error).toMatchObject({ _tag: "ValidationError", message: "empty patch" })
    }).pipe(Effect.provide(layer)),
  )

  it.effect("refuses a built-in as Forbidden and an unknown id as NotFound program", () =>
    Effect.gen(function* () {
      const builtin = yield* Effect.flip(
        updateProgram.run(userA, update({ programId: "core-30", title: "Mine" })),
      )
      expect(builtin).toMatchObject({ _tag: "Forbidden" })
      const unknown = yield* Effect.flip(
        updateProgram.run(userA, update({ programId: "no-such-program", title: "Mine" })),
      )
      expect(unknown).toMatchObject({ _tag: "NotFound", entity: "program", id: "no-such-program" })
    }).pipe(Effect.provide(layer)),
  )

  it.effect("does not reach another user's program", () =>
    Effect.gen(function* () {
      const created = yield* writeProgram.run(userA, written(program(THREE_DAYS)))
      const error = yield* Effect.flip(
        updateProgram.run(userB, update({ programId: created.programId, title: "Mine" })),
      )
      expect(error).toMatchObject({ _tag: "NotFound", entity: "program" })
    }).pipe(Effect.provide(layer)),
  )
})

describe("delete_program", () => {
  it.effect("refuses with an open enrollment, force abandons it, a second delete is false", () =>
    Effect.gen(function* () {
      yield* setup
      const created = yield* writeProgram.run(userA, written(program(THREE_DAYS)))
      yield* enrollProgram.run(userA, enroll({ programId: created.programId }))
      const refused = yield* Effect.flip(
        deleteProgram.run(userA, del({ programId: created.programId })),
      )
      expect(refused).toMatchObject({
        _tag: "ValidationError",
        message: "program has 1 active enrollments; pass force: true to abandon them and delete",
      })
      const forced = yield* deleteProgram.run(
        userA,
        del({ programId: created.programId, force: true }),
      )
      expect(forced).toEqual({ deleted: true, abandonedEnrollments: 1 })
      const enrollments = yield* (yield* UserProgramRepo).enrollments(userA)
      expect(enrollments.map((row) => row.status)).toEqual(["abandoned"])
      expect(yield* deleteProgram.run(userA, del({ programId: created.programId }))).toEqual({
        deleted: false,
        abandonedEnrollments: 0,
      })
      const listed = yield* listPrograms.run(userA, Schema.decodeUnknownSync(ListProgramsInput)({}))
      expect(listed.programs.map((p) => p.source)).not.toContain("mcp")
    }).pipe(Effect.provide(layer)),
  )

  it.effect("refuses a built-in as Forbidden", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(deleteProgram.run(userA, del({ programId: "core-30" })))
      expect(error).toMatchObject({ _tag: "Forbidden" })
    }).pipe(Effect.provide(layer)),
  )
})

describe("enroll_program and set_enrollment_status", () => {
  it.effect(
    "enrolls today in the profile zone, and a second call returns the same enrollment",
    () =>
      Effect.gen(function* () {
        yield* setup
        const first = yield* enrollProgram.run(userA, enroll({ programId: "core-30" }))
        expect(first.alreadyActive).toBe(false)
        expect(first.enrollment).toMatchObject({
          programId: "core-30",
          status: "active",
          startedOn: "2026-10-29",
          currentDay: 1,
          totalDays: 30,
          completedDays: 0,
          swaps: [],
        })
        const second = yield* enrollProgram.run(userA, enroll({ programId: "core-30" }))
        expect(second.alreadyActive).toBe(true)
        expect(second.enrollment.enrollmentId).toBe(first.enrollment.enrollmentId)
        expect(yield* (yield* UserProgramRepo).enrollments(userA)).toHaveLength(1)
      }).pipe(Effect.provide(layer)),
  )

  it.effect("honours startedOn and refuses an unknown program", () =>
    Effect.gen(function* () {
      yield* setup
      const result = yield* enrollProgram.run(
        userA,
        enroll({ programId: "core-30", startedOn: "2026-10-01" }),
      )
      expect(result.enrollment.startedOn).toBe("2026-10-01")
      const error = yield* Effect.flip(enrollProgram.run(userA, enroll({ programId: "nope" })))
      expect(error).toMatchObject({ _tag: "NotFound", entity: "program", id: "nope" })
    }).pipe(Effect.provide(layer)),
  )

  it.effect("a paused enrollment is reported as paused and still counts as already active", () =>
    Effect.gen(function* () {
      yield* setup
      const { enrollment } = yield* enrollProgram.run(userA, enroll({ programId: "core-30" }))
      const paused = yield* setEnrollmentStatus.run(
        userA,
        status({ enrollmentId: enrollment.enrollmentId, status: "paused" }),
      )
      expect(paused.enrollment.status).toBe("paused")
      const reported = yield* getProgramProgress.run(userA, progress({ programId: "core-30" }))
      expect(reported.enrollments.map((e) => e.status)).toEqual(["paused"])
      const again = yield* enrollProgram.run(userA, enroll({ programId: "core-30" }))
      expect(again.alreadyActive).toBe(true)
      const resumed = yield* setEnrollmentStatus.run(
        userA,
        status({ enrollmentId: enrollment.enrollmentId, status: "active" }),
      )
      expect(resumed.enrollment.status).toBe("active")
    }).pipe(Effect.provide(layer)),
  )

  it.effect("refuses a status change on an abandoned enrollment and an unknown id", () =>
    Effect.gen(function* () {
      yield* setup
      const { enrollment } = yield* enrollProgram.run(userA, enroll({ programId: "core-30" }))
      yield* setEnrollmentStatus.run(
        userA,
        status({ enrollmentId: enrollment.enrollmentId, status: "abandoned" }),
      )
      const error = yield* Effect.flip(
        setEnrollmentStatus.run(
          userA,
          status({ enrollmentId: enrollment.enrollmentId, status: "active" }),
        ),
      )
      expect(error).toMatchObject({ _tag: "ValidationError", message: "enrollment is abandoned" })
      const missing = yield* Effect.flip(
        setEnrollmentStatus.run(
          userA,
          status({ enrollmentId: "00000000-0000-4000-8000-0000000000ff", status: "paused" }),
        ),
      )
      expect(missing).toMatchObject({ _tag: "NotFound", entity: "programEnrollment" })
    }).pipe(Effect.provide(layer)),
  )
})

describe("swap_exercise", () => {
  const crunch = CatalogId.make("crunch")
  const candidates = Option.match(findCatalogExercise(crunch), {
    onNone: () => [] as ReadonlyArray<string>,
    onSome: (entry) =>
      Arr.map(swapCandidates(entry, CATALOG, Option.none()), (candidate) => candidate.catalogId),
  })

  it("has candidates to swap crunch for", () => {
    expect(candidates.length).toBeGreaterThan(0)
  })

  it.effect("stores a candidate per enrollment, replaces it, and reverts with null", () =>
    Effect.gen(function* () {
      yield* setup
      const created = yield* writeProgram.run(userA, written(program(THREE_DAYS)))
      const { enrollment } = yield* enrollProgram.run(
        userA,
        enroll({ programId: created.programId }),
      )
      const [first, second] = candidates
      const done = yield* swapExercise.run(
        userA,
        swap({ enrollmentId: enrollment.enrollmentId, from: "crunch", to: first }),
      )
      expect(done.swaps).toEqual([{ from: "crunch", to: first }])
      expect(done.candidates).toEqual(candidates)
      const replaced = yield* swapExercise.run(
        userA,
        swap({ enrollmentId: enrollment.enrollmentId, from: "crunch", to: second }),
      )
      expect(replaced.swaps).toEqual([{ from: "crunch", to: second }])
      const detail = yield* getProgram.run(userA, one({ programId: created.programId }))
      expect(detail.enrollments[0]?.swaps).toEqual([{ from: "crunch", to: second }])
      expect(detail.program.days[0]?.items[0]?.catalogId).toBe("crunch")
      const reverted = yield* swapExercise.run(
        userA,
        swap({ enrollmentId: enrollment.enrollmentId, from: "crunch", to: null }),
      )
      expect(reverted.swaps).toEqual([])
    }).pipe(Effect.provide(layer)),
  )

  it.effect("rejects a `from` the program lacks and a `to` that is not a candidate", () =>
    Effect.gen(function* () {
      yield* setup
      const created = yield* writeProgram.run(userA, written(program(THREE_DAYS)))
      const { enrollment } = yield* enrollProgram.run(
        userA,
        enroll({ programId: created.programId }),
      )
      const notInProgram = yield* Effect.flip(
        swapExercise.run(
          userA,
          swap({ enrollmentId: enrollment.enrollmentId, from: "v-up", to: "crunch" }),
        ),
      )
      expect(notInProgram).toMatchObject({ _tag: "ValidationError" })
      expect(notInProgram.message).toContain("v-up is not an exercise of program")
      // `plank` is timed: never a candidate for a reps exercise.
      const notCandidate = yield* Effect.flip(
        swapExercise.run(
          userA,
          swap({ enrollmentId: enrollment.enrollmentId, from: "crunch", to: "plank" }),
        ),
      )
      expect(notCandidate).toMatchObject({ _tag: "ValidationError" })
      expect(notCandidate.message).toContain(`candidates: ${candidates.join(", ")}`)
      const enrollments = yield* (yield* UserProgramRepo).enrollments(userA)
      expect(enrollments[0]?.swaps).toEqual([])
    }).pipe(Effect.provide(layer)),
  )

  it.effect("swaps inside a built-in program without touching it", () =>
    Effect.gen(function* () {
      yield* setup
      const { enrollment } = yield* enrollProgram.run(userA, enroll({ programId: "core-30" }))
      const [first] = candidates
      const done = yield* swapExercise.run(
        userA,
        swap({ enrollmentId: enrollment.enrollmentId, from: "crunch", to: first }),
      )
      expect(done.swaps).toHaveLength(1)
    }).pipe(Effect.provide(layer)),
  )
})

describe("list_programs, get_program, get_program_progress", () => {
  it.effect("lists the built-ins first, then the user's rows, each with its enrollment", () =>
    Effect.gen(function* () {
      yield* setup
      const created = yield* writeProgram.run(userA, written(program(THREE_DAYS)))
      yield* enrollProgram.run(userA, enroll({ programId: created.programId }))
      const listed = yield* listPrograms.run(userA, Schema.decodeUnknownSync(ListProgramsInput)({}))
      expect(listed.programs.map((p) => p.source)).toEqual(["builtin", "builtin", "mcp"])
      const mine = listed.programs[2]
      expect(mine?.programId).toBe(created.programId)
      expect(mine?.enrollment).toMatchObject({ _tag: "Some" })
      expect(listed.programs[0]?.enrollment).toMatchObject({ _tag: "None" })
    }).pipe(Effect.provide(layer)),
  )

  it.effect("get_program answers a built-in and NotFound for an unknown id", () =>
    Effect.gen(function* () {
      const detail = yield* getProgram.run(userA, one({ programId: "core-30" }))
      expect([detail.source, detail.version, detail.program.days.length]).toEqual([
        "builtin",
        1,
        30,
      ])
      const error = yield* Effect.flip(getProgram.run(userA, one({ programId: "nope" })))
      expect(error).toMatchObject({ _tag: "NotFound", entity: "program" })
    }).pipe(Effect.provide(layer)),
  )

  it.effect("get_program_progress lists completions only when a programId is given", () =>
    Effect.gen(function* () {
      yield* setup
      yield* enrollProgram.run(userA, enroll({ programId: "core-30" }))
      const all = yield* getProgramProgress.run(userA, progress({}))
      expect(all.enrollments).toHaveLength(1)
      expect(all.completions).toEqual([])
      const own = yield* getProgramProgress.run(userA, progress({ programId: "core-30" }))
      expect(own.enrollments).toHaveLength(1)
      expect(Schema.is(ProgramId)("core-30")).toBe(true)
    }).pipe(Effect.provide(layer)),
  )
})

describe("tool descriptions", () => {
  const all = [...programReadTools, ...programWriteTools]

  it("registers three reads and six writes in MCP_TOOLS order", () => {
    expect(programReadTools.map((t) => [t.name, t.kind])).toEqual([
      ["list_programs", "read"],
      ["get_program", "read"],
      ["get_program_progress", "read"],
    ])
    expect(programWriteTools.map((t) => t.name)).toEqual([
      "write_program",
      "update_program",
      "delete_program",
      "enroll_program",
      "set_enrollment_status",
      "swap_exercise",
    ])
    expect(programWriteTools.every((t) => t.kind === "write")).toBe(true)
  })

  it("stays within 900 characters and names no trademark", () => {
    expect(all.filter((t) => t.description.length > 900).map((t) => t.name)).toEqual([])
    expect(all.filter((t) => /Labrada|Lee L|Lean Body/.test(t.description))).toEqual([])
  })

  it("carries the design text for write_program and enroll_program", () => {
    const text = (name: string) => all.find((t) => t.name === name)?.description ?? ""
    expect(text("write_program")).toMatch(/^Create or replace one of the user's guided programs/)
    expect(text("write_program")).toMatch(
      /Errors: ValidationError \(field path \+ rule\), NotFound catalogExercise \(an id you made up\), Forbidden \(built-in slug\)\.$/,
    )
    expect(text("enroll_program")).toBe(
      "Start the user's enrollment in a program today (or `startedOn`). Several programs may be active at once; the app's Today lists each active program's next day. Returns the existing enrollment if one is already active/paused.",
    )
  })
})

describe("84-day programs (Lead ruling 2026-10-27)", () => {
  it.effect("writes an 84-day program and reports its day count", () =>
    Effect.gen(function* () {
      const days = Arr.makeBy(84, (i) => day([reps(i % 2 === 0 ? "crunch" : "dead-bug")]))
      const result = yield* writeProgram.run(userA, written(program(days)))
      expect(result.days).toBe(84)
    }).pipe(Effect.provide(layer)),
  )

  it("tells Claude the 84-day cap in the write_program description", () => {
    expect(writeProgram.description).toContain("A program is 1–84 days;")
  })
})

describe("write_program and update_program on a device conflict", () => {
  const conflict = new PersistenceError({
    operation: "program.put",
    cause: ["conflict 00000000-0000-4000-8000-000000000001"],
  })
  /**
   * The repo whose first `put` reports a conflict, the rest delegate. With `device`, a phone's
   * edit (a new summary, `version + 1`) lands through `base.put` just before the conflict.
   */
  const flaky = (device: Option.Option<string> = Option.none()) =>
    Effect.gen(function* () {
      const base = yield* UserProgramRepo
      const puts = yield* Ref.make(0)
      const deviceEdit = (userId: UserId, row: UserProgram) =>
        Option.match(device, {
          onNone: () => Effect.void,
          onSome: (summary) =>
            Effect.gen(function* () {
              const stored = yield* base.get(userId, row.id)
              if (Option.isSome(stored)) {
                yield* base.put(
                  userId,
                  yield* UserProgram.makeEffect({
                    ...stored.value,
                    summary,
                    version: stored.value.version + 1,
                  }).pipe(Effect.orDie),
                )
              }
            }),
        })
      const repo = UserProgramRepo.of({
        ...base,
        put: (userId, row) =>
          Ref.getAndUpdate(puts, (n) => n + 1).pipe(
            Effect.flatMap((n) =>
              n === 0
                ? deviceEdit(userId, row).pipe(Effect.andThen(Effect.fail(conflict)))
                : base.put(userId, row),
            ),
          ),
      })
      return { repo, puts }
    })

  it.effect("write_program reads again and writes once more", () =>
    Effect.gen(function* () {
      const { repo, puts } = yield* flaky()
      const result = yield* writeProgram
        .run(userA, written(program(THREE_DAYS)))
        .pipe(Effect.provideService(UserProgramRepo, repo))
      expect([result.created, result.version]).toEqual([true, 1])
      expect(yield* Ref.get(puts)).toBe(2)
    }).pipe(Effect.provide(layer)),
  )

  it.effect("update_program patches the fresh row, keeping the device's edit", () =>
    Effect.gen(function* () {
      const created = yield* writeProgram.run(userA, written(program(THREE_DAYS)))
      const { repo, puts } = yield* flaky(Option.some("Edited on the phone"))
      const result = yield* updateProgram
        .run(userA, update({ programId: created.programId, title: "Retitled" }))
        .pipe(Effect.provideService(UserProgramRepo, repo))
      // v1 (written) → v2 (device edit) → v3 (this patch on the fresh row).
      expect(result.version).toBe(3)
      // The device's edit goes through `base.put`, uncounted: the conflict, then the retry.
      expect(yield* Ref.get(puts)).toBe(2)
      const rows = yield* (yield* UserProgramRepo).list(userA)
      expect(rows.map((row) => [row.title, row.summary, row.version])).toEqual([
        ["Retitled", "Edited on the phone", 3],
      ])
    }).pipe(Effect.provide(layer)),
  )

  it.effect("a PersistenceError that is not a conflict is not retried", () =>
    Effect.gen(function* () {
      const base = yield* UserProgramRepo
      const puts = yield* Ref.make(0)
      const repo = UserProgramRepo.of({
        ...base,
        put: () =>
          Ref.update(puts, (n) => n + 1).pipe(
            Effect.andThen(
              Effect.fail(new PersistenceError({ operation: "program.put", cause: ["db down"] })),
            ),
          ),
      })
      const error = yield* Effect.flip(
        writeProgram
          .run(userA, written(program(THREE_DAYS)))
          .pipe(Effect.provideService(UserProgramRepo, repo)),
      )
      expect(error).toMatchObject({ _tag: "PersistenceError", cause: ["db down"] })
      expect(yield* Ref.get(puts)).toBe(1)
    }).pipe(Effect.provide(layer)),
  )

  it.effect("a second conflict is the caller's: PersistenceError, nothing written", () =>
    Effect.gen(function* () {
      const base = yield* UserProgramRepo
      const repo = UserProgramRepo.of({ ...base, put: () => Effect.fail(conflict) })
      const error = yield* Effect.flip(
        writeProgram
          .run(userA, written(program(THREE_DAYS)))
          .pipe(Effect.provideService(UserProgramRepo, repo)),
      )
      expect(error).toMatchObject({ _tag: "PersistenceError", operation: "program.put" })
      expect(yield* base.list(userA)).toEqual([])
    }).pipe(Effect.provide(layer)),
  )
})

describe("get_program_progress reads each enrollment's completions once", () => {
  it.effect("one completions statement per enrollment, summary and day list alike", () =>
    Effect.gen(function* () {
      yield* setup
      yield* enrollProgram.run(userA, enroll({ programId: "core-30" }))
      const base = yield* UserProgramRepo
      const reads = yield* Ref.make(0)
      const repo = UserProgramRepo.of({
        ...base,
        completions: (userId, enrollmentId) =>
          Ref.update(reads, (n) => n + 1).pipe(
            Effect.andThen(base.completions(userId, enrollmentId)),
          ),
      })
      const result = yield* getProgramProgress
        .run(userA, progress({ programId: "core-30" }))
        .pipe(Effect.provideService(UserProgramRepo, repo))
      expect(result.enrollments).toHaveLength(1)
      expect(yield* Ref.get(reads)).toBe(1)
    }).pipe(Effect.provide(layer)),
  )
})
