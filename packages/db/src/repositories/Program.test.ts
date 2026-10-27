import { describe, expect, it } from "@effect/vitest"
import {
  IdGenerator,
  ProgramDayCompletion,
  ProgramEnrollment,
  type ProgramEnrollmentEncoded,
  ProgramEnrollmentId,
  ProgramId,
  Slug,
  UserId,
  UserProgram,
  type UserProgramEncoded,
  UserProgramId,
} from "@tanren/shared"
import { Array as Arr, DateTime, Effect, Layer, Option, Schema } from "effect"
import { TestClock } from "effect/testing"
import { SyncStore } from "../sync/SyncStore"
import { TestLayer, t1 } from "../testing/fixtures"
import { UserProgramRepo } from "./Program"

const RepoLayer = UserProgramRepo.layer.pipe(
  Layer.provideMerge(SyncStore.layer),
  Layer.provideMerge(Layer.mergeAll(TestLayer, IdGenerator.layerTest)),
)

const id = (n: number) => `72000000-0000-4000-8000-${n.toString().padStart(12, "0")}`
/** One user per test: the D1 is shared by the file. */
const userOf = (n: number) =>
  UserId.make(`00000000-0000-4000-8000-${(0x720 + n).toString(16).padStart(12, "0")}`)
const setNow = TestClock.setTime(
  DateTime.toEpochMillis(DateTime.makeUnsafe("2026-10-27T13:00:00.000Z")),
)

const program = (
  overrides: Partial<UserProgramEncoded> & Pick<UserProgramEncoded, "id" | "userId">,
) =>
  Schema.decodeUnknownSync(UserProgram)({
    createdAt: t1,
    updatedAt: t1,
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
  overrides: Partial<ProgramEnrollmentEncoded> & Pick<ProgramEnrollmentEncoded, "id" | "userId">,
) =>
  Schema.decodeUnknownSync(ProgramEnrollment)({
    createdAt: t1,
    updatedAt: t1,
    deletedAt: null,
    programId: "core-30",
    startedOn: "2026-10-20",
    status: "active",
    currentDay: 1,
    swaps: [],
    ...overrides,
  })

describe("UserProgramRepo", () => {
  it.effect("puts a program and reads it back by id and by slug", () =>
    Effect.gen(function* () {
      yield* setNow
      const repo = yield* UserProgramRepo
      const user = userOf(1)
      yield* repo.put(user, program({ id: id(1), userId: user }))
      const byId = yield* repo.get(user, UserProgramId.make(id(1)))
      const bySlug = yield* repo.bySlug(user, Slug.make("push-pull"))
      expect(Option.map(byId, (p) => p.title)).toEqual(Option.some("Push Pull"))
      expect(Option.map(bySlug, (p) => p.id)).toEqual(Option.some(id(1)))
    }).pipe(Effect.provide(RepoLayer)),
  )

  it.effect("replaces a program with the same clock (the Worker write wins LWW)", () =>
    Effect.gen(function* () {
      yield* setNow
      const repo = yield* UserProgramRepo
      const user = userOf(2)
      yield* repo.put(user, program({ id: id(2), userId: user }))
      yield* repo.put(user, program({ id: id(2), userId: user, title: "Renamed", version: 2 }))
      const found = yield* repo.get(user, UserProgramId.make(id(2)))
      expect(Option.map(found, (p) => [p.title, p.version])).toEqual(Option.some(["Renamed", 2]))
    }).pipe(Effect.provide(RepoLayer)),
  )

  it.effect("rejects a second live program with the same slug as invariantViolated", () =>
    Effect.gen(function* () {
      yield* setNow
      const repo = yield* UserProgramRepo
      const user = userOf(3)
      yield* repo.put(user, program({ id: id(3), userId: user }))
      const error = yield* Effect.flip(repo.put(user, program({ id: id(4), userId: user })))
      expect(error._tag).toBe("PersistenceError")
      expect(JSON.stringify(error)).toContain(`invariantViolated ${id(4)}`)
    }).pipe(Effect.provide(RepoLayer)),
  )

  it.effect("refuses another user's row with Forbidden", () =>
    Effect.gen(function* () {
      yield* setNow
      const repo = yield* UserProgramRepo
      const error = yield* Effect.flip(
        repo.put(userOf(4), program({ id: id(5), userId: userOf(5) })),
      )
      expect(error._tag).toBe("Forbidden")
    }).pipe(Effect.provide(RepoLayer)),
  )

  it.effect("soft-deletes once, then reports false", () =>
    Effect.gen(function* () {
      yield* setNow
      const repo = yield* UserProgramRepo
      const user = userOf(6)
      yield* repo.put(user, program({ id: id(6), userId: user }))
      const first = yield* repo.softDelete(user, UserProgramId.make(id(6)))
      const second = yield* repo.softDelete(user, UserProgramId.make(id(6)))
      const gone = yield* repo.get(user, UserProgramId.make(id(6)))
      expect([first, second, Option.isNone(gone)]).toEqual([true, false, true])
    }).pipe(Effect.provide(RepoLayer)),
  )

  it.effect("frees the slug of a deleted program for a new row", () =>
    Effect.gen(function* () {
      yield* setNow
      const repo = yield* UserProgramRepo
      const user = userOf(7)
      yield* repo.put(user, program({ id: id(7), userId: user }))
      yield* repo.softDelete(user, UserProgramId.make(id(7)))
      yield* repo.put(user, program({ id: id(8), userId: user }))
      const bySlug = yield* repo.bySlug(user, Slug.make("push-pull"))
      expect(Option.map(bySlug, (p) => p.id)).toEqual(Option.some(id(8)))
    }).pipe(Effect.provide(RepoLayer)),
  )

  it.effect("lists live programs by title, without tombstones or other users' rows", () =>
    Effect.gen(function* () {
      yield* setNow
      const repo = yield* UserProgramRepo
      const user = userOf(8)
      yield* repo.put(user, program({ id: id(10), userId: user, title: "Zeta", slug: "zeta" }))
      yield* repo.put(user, program({ id: id(11), userId: user, title: "Alpha", slug: "alpha" }))
      yield* repo.put(user, program({ id: id(12), userId: user, title: "Gone", slug: "gone" }))
      yield* repo.put(userOf(9), program({ id: id(13), userId: userOf(9), title: "Beta" }))
      yield* repo.softDelete(user, UserProgramId.make(id(12)))
      const titles = Arr.map(yield* repo.list(user), (p) => p.title)
      expect(titles).toEqual(["Alpha", "Zeta"])
    }).pipe(Effect.provide(RepoLayer)),
  )

  it.effect("lists enrollments newest first, filtered by programId when given", () =>
    Effect.gen(function* () {
      yield* setNow
      const repo = yield* UserProgramRepo
      const user = userOf(10)
      yield* repo.putEnrollment(
        user,
        enrollment({ id: id(20), userId: user, startedOn: "2026-10-01", status: "completed" }),
      )
      yield* repo.putEnrollment(
        user,
        enrollment({ id: id(21), userId: user, startedOn: "2026-10-20" }),
      )
      yield* repo.putEnrollment(
        user,
        enrollment({ id: id(22), userId: user, programId: id(10), startedOn: "2026-10-10" }),
      )
      const all = Arr.map(yield* repo.enrollments(user), (e) => e.id)
      const core = Arr.map(yield* repo.enrollments(user, ProgramId.make("core-30")), (e) => e.id)
      expect(all).toEqual([id(21), id(22), id(20)])
      expect(core).toEqual([id(21), id(20)])
    }).pipe(Effect.provide(RepoLayer)),
  )

  it.effect("stores an enrollment's swaps and status changes", () =>
    Effect.gen(function* () {
      yield* setNow
      const repo = yield* UserProgramRepo
      const user = userOf(11)
      yield* repo.putEnrollment(user, enrollment({ id: id(30), userId: user }))
      yield* repo.putEnrollment(
        user,
        enrollment({
          id: id(30),
          userId: user,
          status: "paused",
          swaps: [{ from: "push-up", to: "bench-press" }],
        }),
      )
      const [stored] = yield* repo.enrollments(user)
      expect([stored?.status, stored?.swaps]).toEqual([
        "paused",
        [{ from: "push-up", to: "bench-press" }],
      ])
    }).pipe(Effect.provide(RepoLayer)),
  )

  it.effect("rejects a second active enrollment in the same program", () =>
    Effect.gen(function* () {
      yield* setNow
      const repo = yield* UserProgramRepo
      const user = userOf(12)
      yield* repo.putEnrollment(user, enrollment({ id: id(40), userId: user }))
      const error = yield* Effect.flip(
        repo.putEnrollment(user, enrollment({ id: id(41), userId: user })),
      )
      expect(error._tag).toBe("PersistenceError")
    }).pipe(Effect.provide(RepoLayer)),
  )

  it.effect("lists an enrollment's live completions by day number", () =>
    Effect.gen(function* () {
      yield* setNow
      const repo = yield* UserProgramRepo
      const store = yield* SyncStore
      const user = userOf(13)
      yield* repo.putEnrollment(user, enrollment({ id: id(50), userId: user }))
      const completion = (n: number, dayNumber: number) => ({
        table: "programDayCompletion" as const,
        row: Schema.decodeUnknownSync(ProgramDayCompletion)({
          id: id(n),
          userId: user,
          createdAt: t1,
          updatedAt: t1,
          deletedAt: null,
          enrollmentId: id(50),
          dayNumber,
          completedAt: t1,
          durationSeconds: 600,
          sessionId: null,
        }),
      })
      yield* store.apply(user, [completion(52, 2), completion(51, 1)])
      const days = Arr.map(
        yield* repo.completions(user, ProgramEnrollmentId.make(id(50))),
        (c) => c.dayNumber,
      )
      expect(days).toEqual([1, 2])
    }).pipe(Effect.provide(RepoLayer)),
  )

  it.effect("fails with conflict when a newer device push lands between stamp read and write", () =>
    Effect.gen(function* () {
      yield* setNow
      const repo = yield* UserProgramRepo
      const user = userOf(14)
      const error = yield* Effect.flip(repo.put(user, program({ id: id(60), userId: user })))
      expect(error._tag).toBe("PersistenceError")
      expect(JSON.stringify(error)).toContain(`conflict ${id(60)}`)
      const stored = yield* repo.get(user, UserProgramId.make(id(60)))
      expect(Option.map(stored, (p) => p.title)).toEqual(Option.some("From the phone"))
    }).pipe(Effect.provide(racingLayer(userOf(14), id(60)))),
  )
})

/**
 * The repo over a `SyncStore` whose `apply` first lands a newer device row for `rowId` (as if a
 * phone pushed between the repo's stamp read and its write), then applies the repo's changes.
 */
const racingLayer = (user: UserId, rowId: string) =>
  UserProgramRepo.layer.pipe(
    Layer.provide(
      Layer.effect(
        SyncStore,
        Effect.map(SyncStore, (inner) =>
          SyncStore.of({
            ...inner,
            apply: (userId, changes, guard) =>
              inner
                .apply(user, [
                  {
                    table: "program",
                    row: program({
                      id: rowId,
                      userId: user,
                      title: "From the phone",
                      updatedAt: "2026-10-27T12:00:00.000Z",
                    }),
                  },
                ])
                .pipe(Effect.andThen(inner.apply(userId, changes, guard))),
          }),
        ),
      ),
    ),
    Layer.provideMerge(SyncStore.layer),
    Layer.provideMerge(Layer.mergeAll(TestLayer, IdGenerator.layerTest)),
  )
