import { describe, expect, it } from "@effect/vitest"
import { UserProgramRepo } from "@tanren/db"
import {
  ProgramEnrollment,
  type ProgramEnrollmentEncoded,
  ProgramId,
  Slug,
  UserId,
  UserProgram,
  type UserProgramEncoded,
  UserProgramId,
} from "@tanren/shared"
import { Array as Arr, Effect, HashMap, Option, Ref, Schema } from "effect"
import { MemoryStore, uniqueViolation } from "./MemoryStore"
import { Repositories } from "./Repositories"

const owner = UserId.make("00000000-0000-4000-8000-0000000000f1")
const intruder = UserId.make("00000000-0000-4000-8000-0000000000f2")
const id = (n: number) => `73000000-0000-4000-8000-${n.toString().padStart(12, "0")}`
const T = "2026-10-27T08:00:00.000Z"

const program = (overrides: Partial<UserProgramEncoded> & Pick<UserProgramEncoded, "id">) =>
  Schema.decodeUnknownSync(UserProgram)({
    userId: owner,
    createdAt: T,
    updatedAt: T,
    deletedAt: null,
    title: "Push Pull",
    slug: "push-pull",
    summary: "Two days a week.",
    description: null,
    days: [
      {
        dayNumber: 1,
        title: "Day 1",
        rounds: 2,
        items: [{ kind: "reps", catalogId: "push-up", reps: 10, restSeconds: 30 }],
        restBetweenRoundsSeconds: 60,
      },
    ],
    schedule: { kind: "daysPerWeek", days: 2 },
    source: "mcp",
    version: 1,
    ...overrides,
  })

const enrollment = (
  overrides: Partial<ProgramEnrollmentEncoded> & Pick<ProgramEnrollmentEncoded, "id">,
) =>
  Schema.decodeUnknownSync(ProgramEnrollment)({
    userId: owner,
    createdAt: T,
    updatedAt: T,
    deletedAt: null,
    programId: "core-30",
    startedOn: "2026-10-20",
    status: "active",
    currentDay: 1,
    swaps: [],
    ...overrides,
  })

describe("MemoryPrograms (UserProgramRepo on the MemoryStore)", () => {
  it.effect("replaces a program at the same clock and reads it by id and slug", () =>
    Effect.gen(function* () {
      const repo = yield* UserProgramRepo
      yield* repo.put(owner, program({ id: id(1) }))
      yield* repo.put(owner, program({ id: id(1), title: "Renamed", version: 2 }))
      const byId = yield* repo.get(owner, UserProgramId.make(id(1)))
      const bySlug = yield* repo.bySlug(owner, Slug.make("push-pull"))
      expect(Option.map(byId, (p) => [p.title, p.version])).toEqual(Option.some(["Renamed", 2]))
      expect(Option.map(bySlug, (p) => p.id)).toEqual(Option.some(id(1)))
    }).pipe(Effect.provide(Repositories.layerMemory)),
  )

  it.effect("rejects a second live program with the same slug", () =>
    Effect.gen(function* () {
      const repo = yield* UserProgramRepo
      yield* repo.put(owner, program({ id: id(2) }))
      const error = yield* Effect.flip(repo.put(owner, program({ id: id(3) })))
      expect(error._tag).toBe("PersistenceError")
      expect(JSON.stringify(error)).toContain("program_user_slug_unique")
    }).pipe(Effect.provide(Repositories.layerMemory)),
  )

  it.effect("rejects a changed slug as immutableFieldChanged", () =>
    Effect.gen(function* () {
      const repo = yield* UserProgramRepo
      yield* repo.put(owner, program({ id: id(4) }))
      const error = yield* Effect.flip(repo.put(owner, program({ id: id(4), slug: "renamed" })))
      expect(JSON.stringify(error)).toContain("immutableFieldChanged")
    }).pipe(Effect.provide(Repositories.layerMemory)),
  )

  it.effect("refuses an id another user holds with Forbidden", () =>
    Effect.gen(function* () {
      const repo = yield* UserProgramRepo
      yield* repo.put(owner, program({ id: id(5) }))
      const error = yield* Effect.flip(
        repo.put(intruder, program({ id: id(5), userId: intruder, slug: "mine" })),
      )
      expect(error._tag).toBe("Forbidden")
    }).pipe(Effect.provide(Repositories.layerMemory)),
  )

  it.effect("soft-deletes once, then reports false; list is live rows by title", () =>
    Effect.gen(function* () {
      const repo = yield* UserProgramRepo
      yield* repo.put(owner, program({ id: id(6), title: "Zeta", slug: "zeta" }))
      yield* repo.put(owner, program({ id: id(7), title: "Alpha", slug: "alpha" }))
      yield* repo.put(owner, program({ id: id(8), title: "Gone", slug: "gone" }))
      const first = yield* repo.softDelete(owner, UserProgramId.make(id(8)))
      const second = yield* repo.softDelete(owner, UserProgramId.make(id(8)))
      expect([first, second]).toEqual([true, false])
      expect(Arr.map(yield* repo.list(owner), (p) => p.title)).toEqual(["Alpha", "Zeta"])
    }).pipe(Effect.provide(Repositories.layerMemory)),
  )

  it.effect("lists enrollments newest first, filtered by programId when given", () =>
    Effect.gen(function* () {
      const repo = yield* UserProgramRepo
      yield* repo.putEnrollment(
        owner,
        enrollment({ id: id(20), startedOn: "2026-10-01", status: "completed" }),
      )
      yield* repo.putEnrollment(owner, enrollment({ id: id(21), startedOn: "2026-10-20" }))
      yield* repo.putEnrollment(
        owner,
        enrollment({ id: id(22), programId: id(6), startedOn: "2026-10-10" }),
      )
      const all = Arr.map(yield* repo.enrollments(owner), (e) => e.id)
      const core = Arr.map(yield* repo.enrollments(owner, ProgramId.make("core-30")), (e) => e.id)
      expect(all).toEqual([id(21), id(22), id(20)])
      expect(core).toEqual([id(21), id(20)])
    }).pipe(Effect.provide(Repositories.layerMemory)),
  )

  it.effect(
    "rejects an enrollment whose programId or startedOn changed as immutableFieldChanged",
    () =>
      Effect.gen(function* () {
        const repo = yield* UserProgramRepo
        yield* repo.putEnrollment(owner, enrollment({ id: id(40) }))
        const moved = yield* Effect.flip(
          repo.putEnrollment(owner, enrollment({ id: id(40), programId: "lean-build-12" })),
        )
        const restarted = yield* Effect.flip(
          repo.putEnrollment(owner, enrollment({ id: id(40), startedOn: "2026-10-21" })),
        )
        expect(JSON.stringify(moved)).toContain(`immutableFieldChanged ${id(40)}`)
        expect(JSON.stringify(restarted)).toContain(`immutableFieldChanged ${id(40)}`)
      }).pipe(Effect.provide(Repositories.layerMemory)),
  )

  it.effect("uniqueViolation names program_user_slug_unique for two live rows with one slug", () =>
    Effect.gen(function* () {
      const store = yield* MemoryStore
      const state = yield* Ref.get(store.state)
      const stored = (row: UserProgram) => ({ row, seq: 1 })
      const tables = {
        ...state.tables,
        program: HashMap.fromIterable([
          [id(30), stored(program({ id: id(30) }))],
          [id(31), stored(program({ id: id(31) }))],
        ]),
      }
      expect(uniqueViolation(tables, owner)).toEqual(Option.some("program_user_slug_unique"))
    }).pipe(Effect.provide(Repositories.layerMemory)),
  )
})
