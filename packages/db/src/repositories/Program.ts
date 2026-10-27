import { D1Client } from "@effect/sql-d1"
import {
  Forbidden,
  type ProgramDayCompletion,
  ProgramDayCompletionRow,
  ProgramEnrollment,
  type ProgramEnrollmentId,
  ProgramEnrollmentRow,
  type ProgramId,
  type Slug,
  type SyncChange,
  Timestamp,
  type UserId,
  UserProgram,
  type UserProgramId,
  UserProgramRow,
} from "@tanren/shared"
import { Array as Arr, Context, DateTime, Effect, Layer, Option, Schema } from "effect"
import { SqlSchema } from "effect/sql"
import { PersistenceError, persistenceError } from "../errors"
import { SyncStore } from "../sync/SyncStore"

/**
 * The Worker's view of the user's programs and their progress (programs-mcp.md §2, ADR-0026).
 * Every write is a `SyncChange` through `SyncStore.apply`, so LWW, the partial unique indexes,
 * the immutable `slug` / `source`, `server_seq` and the pull cursor behave exactly as for client
 * pushes. A write is the Worker's and wins LWW: its `updatedAt` is bumped to 1 ms past the stored
 * row when it is not newer (an equal clock would otherwise land in `conflicts` and write nothing).
 */
export interface UserProgramRepoShape {
  /** Live rows, ordered by title (then id). */
  readonly list: (userId: UserId) => Effect.Effect<ReadonlyArray<UserProgram>, PersistenceError>
  /** The live row `id`. */
  readonly get: (
    userId: UserId,
    id: UserProgramId,
  ) => Effect.Effect<Option.Option<UserProgram>, PersistenceError>
  /** The live row with `slug` (unique among live rows). */
  readonly bySlug: (
    userId: UserId,
    slug: Slug,
  ) => Effect.Effect<Option.Option<UserProgram>, PersistenceError>
  /**
   * Inserts or replaces the row. Another user's row is `Forbidden`; any other rejection (a slug
   * another live row holds, a changed `slug` / `source`) is `PersistenceError` naming the reason
   * (`invariantViolated`, `immutableFieldChanged`) and the id.
   */
  readonly put: (
    userId: UserId,
    row: UserProgram,
  ) => Effect.Effect<void, PersistenceError | Forbidden>
  /** Tombstones the live row `id`; `false` when the user has no live row with that id. */
  readonly softDelete: (
    userId: UserId,
    id: UserProgramId,
  ) => Effect.Effect<boolean, PersistenceError>
  /** Live enrollments (only `programId`'s when given), newest `startedOn` first (then id). */
  readonly enrollments: (
    userId: UserId,
    programId?: ProgramId,
  ) => Effect.Effect<ReadonlyArray<ProgramEnrollment>, PersistenceError>
  /** Inserts or replaces the enrollment; rejections map as in `put` (one live `active` per program). */
  readonly putEnrollment: (
    userId: UserId,
    row: ProgramEnrollment,
  ) => Effect.Effect<void, PersistenceError | Forbidden>
  /** Live completions of the enrollment, by day number. */
  readonly completions: (
    userId: UserId,
    enrollmentId: ProgramEnrollmentId,
  ) => Effect.Effect<ReadonlyArray<ProgramDayCompletion>, PersistenceError>
}

/** The row's own stamp, or 1 ms past the stored row when that is not older (the Worker wins LWW). */
const stampAfter = (wanted: DateTime.Utc, stored: Option.Option<DateTime.Utc>): DateTime.Utc =>
  Option.match(stored, {
    onNone: () => wanted,
    onSome: (s) =>
      DateTime.isGreaterThan(wanted, s) ? wanted : DateTime.add(s, { milliseconds: 1 }),
  })

const ByUser = Schema.Struct({ userId: Schema.String })
const ById = Schema.Struct({ userId: Schema.String, id: Schema.String })
const UpdatedAt = Schema.Struct({ updatedAt: Timestamp })

export class UserProgramRepo extends Context.Service<UserProgramRepo, UserProgramRepoShape>()(
  "@tanren/UserProgramRepo",
  {
    make: Effect.gen(function* () {
      const sql = yield* D1Client.D1Client
      const store = yield* SyncStore

      const live = SqlSchema.findAll({
        Request: ByUser,
        Result: UserProgramRow,
        execute: ({ userId }) =>
          sql`SELECT * FROM program WHERE user_id = ${userId} AND deleted_at IS NULL
            ORDER BY title, id`,
      })
      const liveById = SqlSchema.findOneOption({
        Request: ById,
        Result: UserProgramRow,
        execute: ({ userId, id }) =>
          sql`SELECT * FROM program WHERE user_id = ${userId} AND id = ${id}
            AND deleted_at IS NULL`,
      })
      const liveBySlug = SqlSchema.findOneOption({
        Request: Schema.Struct({ userId: Schema.String, slug: Schema.String }),
        Result: UserProgramRow,
        execute: ({ userId, slug }) =>
          sql`SELECT * FROM program WHERE user_id = ${userId} AND slug = ${slug}
            AND deleted_at IS NULL`,
      })
      const enrollmentRows = SqlSchema.findAll({
        Request: Schema.Struct({ userId: Schema.String, programId: Schema.NullOr(Schema.String) }),
        Result: ProgramEnrollmentRow,
        execute: ({ userId, programId }) =>
          programId === null
            ? sql`SELECT * FROM program_enrollment WHERE user_id = ${userId}
                AND deleted_at IS NULL ORDER BY started_on DESC, id`
            : sql`SELECT * FROM program_enrollment WHERE user_id = ${userId}
                AND program_id = ${programId} AND deleted_at IS NULL ORDER BY started_on DESC, id`,
      })
      const completionRows = SqlSchema.findAll({
        Request: ById,
        Result: ProgramDayCompletionRow,
        execute: ({ userId, id }) =>
          sql`SELECT * FROM program_day_completion WHERE user_id = ${userId}
            AND enrollment_id = ${id} AND deleted_at IS NULL ORDER BY day_number, id`,
      })
      /** The stored `updated_at` of the caller's row (tombstones included), for `stampAfter`. */
      const storedStamp = (table: "program" | "program_enrollment") =>
        SqlSchema.findOneOption({
          Request: ById,
          Result: UpdatedAt,
          execute: ({ userId, id }) =>
            table === "program"
              ? sql`SELECT updated_at FROM program WHERE user_id = ${userId} AND id = ${id}`
              : sql`SELECT updated_at FROM program_enrollment WHERE user_id = ${userId}
                  AND id = ${id}`,
        })
      const programStamp = storedStamp("program")
      const enrollmentStamp = storedStamp("program_enrollment")

      const stored = (
        operation: string,
        found: Effect.Effect<Option.Option<{ readonly updatedAt: DateTime.Utc }>, unknown>,
      ) =>
        found.pipe(
          Effect.map(Option.map((r) => r.updatedAt)),
          Effect.mapError(persistenceError(operation)),
        )

      /**
       * Applies the changes; `forbidden` → `Forbidden`, any other rejection → `PersistenceError`.
       * A conflict (a device push landed between the stamp read and this write, so the stored row
       * is newer) wrote nothing: `PersistenceError` naming `conflict <id>`, never a silent success.
       */
      const write = (
        operation: string,
        userId: UserId,
        changes: ReadonlyArray<SyncChange>,
      ): Effect.Effect<number, PersistenceError | Forbidden> =>
        Effect.gen(function* () {
          const { accepted, conflicts, rejected } = yield* store.apply(userId, changes)
          if (Arr.some(rejected, (r) => r.reason === "forbidden")) {
            return yield* new Forbidden({ message: "the program row belongs to another user" })
          }
          if (Arr.isReadonlyArrayNonEmpty(rejected)) {
            return yield* new PersistenceError({
              operation,
              cause: Arr.map(rejected, (r) => `${r.reason} ${r.id}: ${r.message}`),
            })
          }
          if (Arr.isReadonlyArrayNonEmpty(conflicts)) {
            return yield* new PersistenceError({
              operation,
              cause: Arr.map(conflicts, (c) => `conflict ${c.row.id}`),
            })
          }
          return accepted.length
        })

      const put = Effect.fn("UserProgramRepo.put")(function* (userId: UserId, row: UserProgram) {
        const prior = yield* stored("program.put", programStamp({ userId, id: row.id }))
        const stamped = yield* UserProgram.makeEffect({
          ...row,
          updatedAt: stampAfter(row.updatedAt, prior),
        }).pipe(Effect.mapError(persistenceError("program.put")))
        yield* write("program.put", userId, [{ table: "program", row: stamped }])
      })

      const putEnrollment = Effect.fn("UserProgramRepo.putEnrollment")(function* (
        userId: UserId,
        row: ProgramEnrollment,
      ) {
        const prior = yield* stored(
          "program.putEnrollment",
          enrollmentStamp({ userId, id: row.id }),
        )
        const stamped = yield* ProgramEnrollment.makeEffect({
          ...row,
          updatedAt: stampAfter(row.updatedAt, prior),
        }).pipe(Effect.mapError(persistenceError("program.putEnrollment")))
        yield* write("program.putEnrollment", userId, [
          { table: "programEnrollment", row: stamped },
        ])
      })

      const softDelete = Effect.fn("UserProgramRepo.softDelete")(function* (
        userId: UserId,
        id: UserProgramId,
      ) {
        const found = yield* liveById({ userId, id }).pipe(
          Effect.mapError(persistenceError("program.softDelete")),
        )
        if (Option.isNone(found)) {
          return false
        }
        const at = stampAfter(yield* DateTime.now, Option.some(found.value.updatedAt))
        const row = yield* UserProgram.makeEffect({
          ...found.value,
          updatedAt: at,
          deletedAt: Option.some(at),
        }).pipe(Effect.mapError(persistenceError("program.softDelete")))
        const written = yield* write("program.softDelete", userId, [
          { table: "program", row },
        ]).pipe(
          Effect.catchTag("Forbidden", (cause) =>
            Effect.fail(new PersistenceError({ operation: "program.softDelete", cause })),
          ),
        )
        return written > 0
      })

      return {
        list: (userId) => live({ userId }).pipe(Effect.mapError(persistenceError("program.list"))),
        get: (userId, id) =>
          liveById({ userId, id }).pipe(Effect.mapError(persistenceError("program.get"))),
        bySlug: (userId, slug) =>
          liveBySlug({ userId, slug }).pipe(Effect.mapError(persistenceError("program.bySlug"))),
        put,
        softDelete,
        enrollments: (userId, programId) =>
          enrollmentRows({ userId, programId: programId ?? null }).pipe(
            Effect.mapError(persistenceError("program.enrollments")),
          ),
        putEnrollment,
        completions: (userId, enrollmentId) =>
          completionRows({ userId, id: enrollmentId }).pipe(
            Effect.mapError(persistenceError("program.completions")),
          ),
      }
    }),
  },
) {
  /** Needs `D1Client` and `SyncStore`. Not in `Repositories.layer` (no SyncStore there). */
  static readonly layer = Layer.effect(this, this.make)
}
