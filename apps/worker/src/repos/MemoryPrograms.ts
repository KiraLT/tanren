import { PersistenceError, UserProgramRepo } from "@tanren/db"
import {
  Forbidden,
  type ProgramDayCompletion,
  ProgramEnrollment,
  type ProgramEnrollmentId,
  type ProgramId,
  type Slug,
  type UserId,
  UserProgram,
  type UserProgramId,
} from "@tanren/shared"
import { Array as Arr, DateTime, Effect, HashMap, Layer, Option, Order, Ref } from "effect"
import { MemoryStore } from "./MemoryStore"

interface Live {
  readonly id: string
  readonly deletedAt: Option.Option<DateTime.Utc>
}
const isLive = (row: Live) => Option.isNone(row.deletedAt)

const byTitle: Order.Order<UserProgram> = Order.combine(
  Order.mapInput(Order.String, (row: UserProgram) => row.title),
  Order.mapInput(Order.String, (row: UserProgram) => row.id),
)
const byStartedDesc: Order.Order<ProgramEnrollment> = Order.combine(
  Order.flip(Order.mapInput(Order.String, (row: ProgramEnrollment) => row.startedOn)),
  Order.mapInput(Order.String, (row: ProgramEnrollment) => row.id),
)
const byDay: Order.Order<ProgramDayCompletion> = Order.combine(
  Order.mapInput(Order.Number, (row: ProgramDayCompletion) => row.dayNumber),
  Order.mapInput(Order.String, (row: ProgramDayCompletion) => row.id),
)

/** The row's own stamp, or 1 ms past the stored row when that is not older (the Worker wins). */
const stampAfter = (wanted: DateTime.Utc, stored: Option.Option<DateTime.Utc>): DateTime.Utc =>
  Option.match(stored, {
    onNone: () => wanted,
    onSome: (s) =>
      DateTime.isGreaterThan(wanted, s) ? wanted : DateTime.add(s, { milliseconds: 1 }),
  })

/** The caller's stored row; an id another user holds is `Forbidden` (as `SyncStore.apply`). */
const owned = <R extends { readonly userId: UserId }>(
  held: Option.Option<{ readonly row: R }>,
  userId: UserId,
): Effect.Effect<Option.Option<{ readonly row: R }>, Forbidden> =>
  Option.exists(held, (s) => s.row.userId !== userId)
    ? Effect.fail(new Forbidden({ message: "the program row belongs to another user" }))
    : Effect.succeed(held)

const failed = (operation: string) => (cause: unknown) => new PersistenceError({ operation, cause })

/**
 * In-memory `UserProgramRepo` for Node tests, on the shared `MemoryStore` (so `/sync/pull` sees the
 * rows). Mirrors the D1 repo over `SyncStore.apply`: an id another user holds is `Forbidden`
 * (`MemoryStore.put`), a slug another live row holds is a `PersistenceError` naming
 * `program_user_slug_unique` (`uniqueViolation`), a changed `slug` / `source` is a
 * `PersistenceError` naming `immutableFieldChanged`, one live `active` enrollment per program.
 */
export const MemoryPrograms = {
  layer: Layer.effect(
    UserProgramRepo,
    Effect.gen(function* () {
      const store = yield* MemoryStore
      const programs = (userId: UserId) =>
        Effect.map(
          store.rows("program", userId),
          Arr.map((s) => s.row),
        )
      const findProgram = (userId: UserId, id: string) =>
        Effect.map(
          programs(userId),
          Arr.findFirst((row) => row.id === id),
        )
      const liveProgram = (userId: UserId, id: string) =>
        Effect.map(findProgram(userId, id), Option.filter(isLive))

      const put = (userId: UserId, row: UserProgram) =>
        Effect.gen(function* () {
          const stored = yield* owned(
            HashMap.get((yield* Ref.get(store.state)).tables.program, row.id),
            userId,
          )
          if (
            Option.exists(stored, (s) => s.row.slug !== row.slug || s.row.source !== row.source)
          ) {
            return yield* new PersistenceError({
              operation: "program.put",
              cause: [`immutableFieldChanged ${row.id}: slug or source changed`],
            })
          }
          const stamped = yield* UserProgram.makeEffect({
            ...row,
            updatedAt: stampAfter(
              row.updatedAt,
              Option.map(stored, (s) => s.row.updatedAt),
            ),
          }).pipe(Effect.mapError(failed("program.put")))
          yield* store.put("program", userId, [stamped])
        })

      const putEnrollment = (userId: UserId, row: ProgramEnrollment) =>
        Effect.gen(function* () {
          const stored = yield* owned(
            HashMap.get((yield* Ref.get(store.state)).tables.programEnrollment, row.id),
            userId,
          )
          if (
            Option.exists(
              stored,
              (s) => s.row.programId !== row.programId || s.row.startedOn !== row.startedOn,
            )
          ) {
            return yield* new PersistenceError({
              operation: "program.putEnrollment",
              cause: [`immutableFieldChanged ${row.id}: programId or startedOn changed`],
            })
          }
          const stamped = yield* ProgramEnrollment.makeEffect({
            ...row,
            updatedAt: stampAfter(
              row.updatedAt,
              Option.map(stored, (s) => s.row.updatedAt),
            ),
          }).pipe(Effect.mapError(failed("program.putEnrollment")))
          yield* store.put("programEnrollment", userId, [stamped])
        })

      const softDelete = (userId: UserId, id: UserProgramId) =>
        Effect.gen(function* () {
          const found = yield* liveProgram(userId, id)
          if (Option.isNone(found)) {
            return false
          }
          const at = stampAfter(yield* DateTime.now, Option.some(found.value.updatedAt))
          const row = yield* UserProgram.makeEffect({
            ...found.value,
            updatedAt: at,
            deletedAt: Option.some(at),
          }).pipe(Effect.mapError(failed("program.softDelete")))
          yield* store
            .put("program", userId, [row])
            .pipe(
              Effect.catchTag("Forbidden", (cause) =>
                Effect.fail(failed("program.softDelete")(cause)),
              ),
            )
          return true
        })

      return UserProgramRepo.of({
        list: (userId) =>
          Effect.map(programs(userId), (rows) => Arr.sort(Arr.filter(rows, isLive), byTitle)),
        get: (userId, id) => liveProgram(userId, id),
        bySlug: (userId, slug: Slug) =>
          Effect.map(
            programs(userId),
            Arr.findFirst((row) => row.slug === slug && isLive(row)),
          ),
        put,
        softDelete,
        enrollments: (userId, programId?: ProgramId) =>
          Effect.map(store.rows("programEnrollment", userId), (stored) =>
            Arr.sort(
              Arr.filter(
                Arr.map(stored, (s) => s.row),
                (row) => isLive(row) && (programId === undefined || row.programId === programId),
              ),
              byStartedDesc,
            ),
          ),
        putEnrollment,
        completions: (userId, enrollmentId: ProgramEnrollmentId) =>
          Effect.map(store.rows("programDayCompletion", userId), (stored) =>
            Arr.sort(
              Arr.filter(
                Arr.map(stored, (s) => s.row),
                (row) => isLive(row) && row.enrollmentId === enrollmentId,
              ),
              byDay,
            ),
          ),
      })
    }),
  ),
} as const
