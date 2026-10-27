import {
  applySwaps,
  type CatalogId,
  type DayNumber,
  type EnrollmentStatus,
  type ExerciseId,
  expandDay,
  findProgram,
  IdGenerator,
  isLoaded,
  newId,
  PROGRAMS,
  type Program,
  type ProgramDay,
  ProgramDayCompletion,
  ProgramDayCompletionId,
  ProgramDayCompletionRow,
  ProgramEnrollment,
  ProgramEnrollmentId,
  ProgramEnrollmentRow,
  type ProgramId,
  type ProgramItem,
  type ProgramMeta,
  type ProgramSummary,
  programIdOfRow,
  Reps,
  SECONDS_PER_REP,
  Session,
  SessionId,
  SetId,
  type SyncChange,
  summarize,
  toProgram,
  type UserId,
  UserProgram,
  type UserProgramId,
  UserProgramRow,
  WeightKg,
  WorkoutSet,
} from "@tanren/shared"
import {
  Array as Arr,
  Context,
  Data,
  DateTime,
  Effect,
  Layer,
  Match,
  Option,
  Semaphore,
} from "effect"
import { CurrentUser, ownerId } from "./CurrentUser"
import { ExerciseLink } from "./ExerciseLink"
import { HistoryRepo } from "./HistoryRepo"
import { decodeRecords, LocalStore, type LocalStoreShape } from "./LocalStore"
import { StoreError } from "./SqlDriver"
import { localToday } from "./TodayRepo"

export interface CompletionInput {
  readonly enrollmentId: ProgramEnrollmentId
  readonly dayNumber: DayNumber
  /** When the player started; P5 uses it for the logged session. */
  readonly startedAt: DateTime.Utc
  readonly durationSeconds: number
  /**
   * How many item-rounds, in sequence order (round-major, as `plannedItems`), finished their work
   * phase. Only those are logged as sets (clamped to 0..total); 0 logs no session.
   */
  readonly performedItems: number
  /**
   * The exercise each performed item-round actually ran, in the same order as `performedItems`
   * (what the player showed, so rounds done before a mid-workout swap stay the old exercise).
   * Position k names the exercise of item-round k; a position past its length (or an empty list)
   * takes the day's own item with the enrollment's swaps as stored.
   */
  readonly performedIds: ReadonlyArray<CatalogId>
  /**
   * The load of each performed item-round, positional with `performedIds`: `Some` for a weighted
   * item (reps item of a loaded exercise, the player's steppers), `None` for timed / bodyweight,
   * which log `0 kg × loggedCount`. A position past its length counts as `None`.
   */
  readonly entries: ReadonlyArray<Option.Option<SetEntry>>
}

/** One performed round of a weighted item (programs-player-v2 §2.2). */
export interface SetEntry {
  readonly weightKg: number
  readonly reps: number
}

/** `Σ weightKg · reps` over the performed rounds (`None` adds 0): the finish sheet's Volume. */
export const volumeOf = (entries: ReadonlyArray<Option.Option<SetEntry>>): number =>
  Arr.reduce(entries, 0, (total, entry) =>
    Option.match(entry, {
      onNone: () => total,
      onSome: ({ weightKg, reps }) => total + weightKg * reps,
    }),
  )

/** Internal: `complete` on an enrollment that is not `active`. Carried as `StoreError.cause`. */
export class EnrollmentNotActive extends Data.TaggedError("EnrollmentNotActive")<{
  readonly id: ProgramEnrollmentId
  readonly status: EnrollmentStatus
}> {}

/** Internal: a status or swap change on a `completed` / `abandoned` enrollment (terminal, §1). */
export class EnrollmentTerminal extends Data.TaggedError("EnrollmentTerminal")<{
  readonly id: ProgramEnrollmentId
  readonly status: "completed" | "abandoned"
}> {}

/** Internal: `complete` for a day other than the enrollment's `currentDay`. Carried as `StoreError.cause`. */
export class DayOutOfOrder extends Data.TaggedError("DayOutOfOrder")<{
  readonly expected: number
  readonly got: number
}> {}

/** Internal: the enrollment is unknown, tombstoned or not the owner's. Carried as `StoreError.cause`. */
export class EnrollmentNotFound extends Data.TaggedError("EnrollmentNotFound")<{
  readonly id: ProgramEnrollmentId
}> {}

/** Internal: the user program is unknown, tombstoned or not the owner's. Carried as `StoreError.cause`. */
export class ProgramNotFound extends Data.TaggedError("ProgramNotFound")<{
  readonly id: UserProgramId
}> {}

/** Internal: `deleteProgram` while an enrollment in it is `active` or `paused`. */
export class ProgramInUse extends Data.TaggedError("ProgramInUse")<{
  readonly id: UserProgramId
  readonly enrollmentId: ProgramEnrollmentId
}> {}

/** A running (`active` or `paused`) enrollment with its program and next day. */
export interface ActiveProgram {
  readonly enrollment: ProgramEnrollment
  readonly program: Program
  /** The day to do next with the enrollment's swaps applied; `None` past the last day. */
  readonly day: Option.Option<ProgramDay>
}

/** The statuses a user (or Claude) may set; `completed` is written only by `complete`. */
export type SettableStatus = Exclude<EnrollmentStatus, "completed">

/** Looks a program up by id: built-ins, then the owner's live `program` rows. */
export type ProgramFinder = (id: ProgramId) => Effect.Effect<Option.Option<Program>, StoreError>

export interface ProgramRepoShape {
  /** Built-ins first, then the owner's live `program` rows (as `toProgram`). */
  readonly find: ProgramFinder
  /** Built-ins in catalog order, then rows by title; each with its live enrollment (running first, else newest). */
  readonly list: () => Effect.Effect<ReadonlyArray<ProgramSummary>, StoreError>
  /** Every live (not tombstoned) enrollment of the owner, any status, newest first. */
  readonly enrollments: Effect.Effect<ReadonlyArray<ProgramEnrollment>, StoreError>
  /** Live `active` and `paused` enrollments, newest first; an unknown program is skipped. */
  readonly activeEnrollments: () => Effect.Effect<ReadonlyArray<ActiveProgram>, StoreError>
  /**
   * `active` enrollments (never `paused`) that still have a day and no live completion on the
   * local date of `now`, newest first.
   */
  readonly dueToday: (now: DateTime.Utc) => Effect.Effect<ReadonlyArray<ActiveProgram>, StoreError>
  /** Returns the live active or paused enrollment for `programId` if there is one, else starts one today. */
  readonly enroll: (programId: ProgramId) => Effect.Effect<ProgramEnrollment, StoreError>
  /**
   * `active ↔ paused`, or `abandoned` ("Leave program"); the same status writes nothing. Fails
   * with `StoreError(EnrollmentTerminal)` on a `completed` / `abandoned` enrollment and with
   * `StoreError(EnrollmentNotFound)` for an unknown id.
   */
  readonly setStatus: (
    id: ProgramEnrollmentId,
    status: SettableStatus,
  ) => Effect.Effect<ProgramEnrollment, StoreError>
  /**
   * Replaces `from` with `to` for this enrollment (dirty); `None` (or `to === from`) reverts it.
   * Terminal enrollments fail like `setStatus`.
   */
  readonly setSwap: (
    id: ProgramEnrollmentId,
    from: CatalogId,
    to: Option.Option<CatalogId>,
  ) => Effect.Effect<ProgramEnrollment, StoreError>
  /** The day to do next with the enrollment's swaps applied; `None` past the last day or for an unknown program. */
  readonly todayFor: (
    enrollment: ProgramEnrollment,
  ) => Effect.Effect<Option.Option<ProgramDay>, StoreError>
  /**
   * The owner's live `program` row for `id`, matched case-insensitively (the editor reads it to
   * rebuild the full row, `description` included); `None` for an unknown or tombstoned id.
   */
  readonly findRow: (id: UserProgramId) => Effect.Effect<Option.Option<UserProgram>, StoreError>
  /**
   * Writes a user program (dirty): a new id is inserted as given; an existing live row keeps its
   * `createdAt`, immutable `slug` / `source`, and gets `version + 1`. `updatedAt` is now.
   */
  readonly save: (row: UserProgram) => Effect.Effect<UserProgram, StoreError>
  /**
   * Tombstones a user program (dirty). Fails with `StoreError(ProgramInUse)` while an enrollment in
   * it is `active` or `paused`, and `StoreError(ProgramNotFound)` for an unknown id.
   */
  readonly deleteProgram: (id: UserProgramId) => Effect.Effect<void, StoreError>
  /**
   * Records the day and moves `currentDay` to `dayNumber + 1` (status `completed` past the last
   * day). Also logs the day, with the enrollment's swaps applied, as an ordinary session with one
   * set per performed item-round (v2-programs.md §5); the completion's `sessionId` points at it, or
   * is `None` when nothing could be logged. Session, sets, completion and enrollment go dirty in one
   * batch (exercise links are written by `ExerciseLink.ensure` just before). Logging never fails the
   * call. A second call for a day that already has a live completion returns that one and writes
   * nothing. Otherwise a non-`active` (incl. `paused`) enrollment fails with
   * `StoreError(EnrollmentNotActive)`, writing nothing. Only the enrollment's `currentDay` can be
   * completed: any other day fails with `StoreError(DayOutOfOrder)`, writing nothing.
   */
  readonly complete: (input: CompletionInput) => Effect.Effect<ProgramDayCompletion, StoreError>
  /**
   * The last live set's load per LOADED catalog id (`isLoaded`; others are skipped), in input order
   * without duplicates: `ExerciseLink.ensure` (creates the `exercise` row the day will log against)
   * then `HistoryRepo.lastSet`. An id that cannot be linked reads `None`.
   */
  readonly lastLoads: (
    catalogIds: ReadonlyArray<CatalogId>,
  ) => Effect.Effect<
    ReadonlyArray<{ readonly catalogId: CatalogId; readonly last: Option.Option<SetEntry> }>,
    StoreError
  >
}

/** Day `currentDay` of `program`, by `dayNumber`; `None` once past the last day. */
export const dayOf = (program: Program, currentDay: number): Option.Option<ProgramDay> =>
  Arr.findFirst(program.days, (day) => day.dayNumber === currentDay)

const q = (sql: string, ...params: ReadonlyArray<string | number | null>) => ({ sql, params })

const toStoreError = (cause: unknown): StoreError => new StoreError({ cause })

/** Work of one item, as `dayDurationSeconds` counts it. */
const workSeconds = (item: ProgramItem): number =>
  Match.value(item).pipe(
    Match.discriminatorsExhaustive("kind")({
      timed: ({ seconds }) => seconds,
      reps: ({ reps }) => reps * SECONDS_PER_REP,
    }),
  )

/** The logged count (ADR-0007 Q4): seconds for a timed item, reps for a reps item. */
const loggedCount = (item: ProgramItem): number =>
  Match.value(item).pipe(
    Match.discriminatorsExhaustive("kind")({
      timed: ({ seconds }) => seconds,
      reps: ({ reps }) => reps,
    }),
  )

const sum = (values: ReadonlyArray<number>): number => Arr.reduce(values, 0, (t, v) => t + v)

export interface PlannedItem {
  readonly item: ProgramItem
  /** Seconds from the start of the day to the end of this item's work. */
  readonly endOffset: number
}

/**
 * Every step (one per set, `expandDay`) of every round in order, with its planned end: the work and
 * rests before it plus its own work, by the same rule as `dayDurationSeconds` (the last step of the
 * final round ends at it). One `workout_set` row is logged per performed entry.
 */
export const plannedItems = (day: ProgramDay): ReadonlyArray<PlannedItem> => {
  const steps = expandDay(day)
  const works = Arr.map(steps, (s) => workSeconds(s.item))
  const rests = Arr.map(steps, (s) => s.restSeconds)
  const roundLength = sum(works) + sum(Arr.dropRight(rests, 1)) + day.restBetweenRoundsSeconds
  return Arr.flatMap(Arr.range(0, day.rounds - 1), (round) =>
    Arr.map(steps, ({ item }, index) => ({
      item,
      endOffset:
        round * roundLength + sum(Arr.take(works, index + 1)) + sum(Arr.take(rests, index)),
    })),
  )
}

const BUILTIN_META: ProgramMeta = { source: "builtin", version: 1, schedule: Option.none() }

const isRunning = (enrollment: ProgramEnrollment) =>
  enrollment.status === "active" || enrollment.status === "paused"

/** The owner's live `program` rows, by title. */
const userPrograms = (store: LocalStoreShape, owner: Effect.Effect<UserId>) =>
  owner.pipe(
    Effect.flatMap((userId) =>
      store.all(
        q(
          `SELECT * FROM "program" WHERE "userId" = ? AND "deletedAt" IS NULL
           ORDER BY "title", "id"`,
          userId,
        ),
      ),
    ),
    Effect.flatMap(decodeRecords(UserProgramRow)),
  )

/** The app's finder: `findProgram` (built-ins), then the owner's rows by `programIdOfRow`. */
const storeFinder: Effect.Effect<ProgramFinder, never, LocalStore | CurrentUser> = Effect.gen(
  function* () {
    const rows = userPrograms(yield* LocalStore, ownerId(yield* CurrentUser))
    return (id: ProgramId) =>
      Option.match(findProgram(id), {
        onSome: (program) => Effect.succeed(Option.some(program)),
        onNone: () =>
          rows.pipe(
            Effect.map((all) =>
              Option.map(
                Arr.findFirst(all, (row) => programIdOfRow(row.id) === id),
                toProgram,
              ),
            ),
          ),
      })
  },
)

/** Builds the repo against a program finder; the app uses `storeFinder`, tests a fixture. */
const make = (find: ProgramFinder) =>
  Effect.gen(function* () {
    const store = yield* LocalStore
    const ids = yield* IdGenerator
    const zone = yield* DateTime.CurrentTimeZone
    /** Writes are read-modify-write: one at a time, so a double tap cannot enrol twice. */
    const lock = yield* Semaphore.make(1)
    const owner = ownerId(yield* CurrentUser)
    const link = yield* ExerciseLink
    const history = yield* HistoryRepo
    const withDeps = <A, E>(
      effect: Effect.Effect<A, E, IdGenerator | DateTime.CurrentTimeZone>,
    ): Effect.Effect<A, E> =>
      effect.pipe(
        Effect.provideService(IdGenerator, ids),
        Effect.provideService(DateTime.CurrentTimeZone, zone),
      )

    const enrollmentsWhere = (clause: string, ...params: ReadonlyArray<string>) =>
      owner.pipe(
        Effect.flatMap((userId) =>
          store.all(
            q(
              `SELECT * FROM "program_enrollment"
               WHERE "userId" = ? AND "deletedAt" IS NULL ${clause}
               ORDER BY "createdAt" DESC, "id" DESC`,
              userId,
              ...params,
            ),
          ),
        ),
        Effect.flatMap(decodeRecords(ProgramEnrollmentRow)),
      )

    const enrollments = enrollmentsWhere("")
    const running = enrollmentsWhere(`AND "status" IN ('active', 'paused')`)

    const byId = (id: ProgramEnrollmentId) =>
      enrollmentsWhere(`AND "id" = ?`, id).pipe(
        Effect.map(Arr.head),
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.fail(toStoreError(new EnrollmentNotFound({ id }))),
            onSome: Effect.succeed,
          }),
        ),
      )

    const todayFor = (enrollment: ProgramEnrollment) =>
      find(enrollment.programId).pipe(
        Effect.map(
          Option.flatMap((program) =>
            Option.map(dayOf(program, enrollment.currentDay), (day) =>
              applySwaps(day, enrollment.swaps),
            ),
          ),
        ),
      )

    const withProgram = (enrollment: ProgramEnrollment) =>
      find(enrollment.programId).pipe(
        Effect.map(
          Option.map(
            (program): ActiveProgram => ({
              enrollment,
              program,
              day: Option.map(dayOf(program, enrollment.currentDay), (day) =>
                applySwaps(day, enrollment.swaps),
              ),
            }),
          ),
        ),
      )

    const activeEnrollments = () =>
      running.pipe(Effect.flatMap(Effect.forEach(withProgram)), Effect.map(Arr.getSomes))

    const liveCompletions = (enrollmentId: ProgramEnrollmentId) =>
      store
        .all(
          q(
            `SELECT * FROM "program_day_completion"
             WHERE "enrollmentId" = ? AND "deletedAt" IS NULL
             ORDER BY "createdAt", "id"`,
            enrollmentId,
          ),
        )
        .pipe(Effect.flatMap(decodeRecords(ProgramDayCompletionRow)))

    const localDate = (at: DateTime.Utc) => DateTime.formatIsoDate(DateTime.setZone(at, zone))

    const dueToday = (now: DateTime.Utc) =>
      Effect.gen(function* () {
        const today = localDate(now)
        const candidates = Arr.filter(
          yield* activeEnrollments(),
          (entry) => entry.enrollment.status === "active" && Option.isSome(entry.day),
        )
        return yield* Effect.filter(candidates, (entry) =>
          liveCompletions(entry.enrollment.id).pipe(
            Effect.map(
              (done) =>
                !Arr.some(done, (completion) => localDate(completion.completedAt) === today),
            ),
          ),
        )
      })

    const list = () =>
      Effect.gen(function* () {
        const all = yield* enrollments
        const rows = yield* userPrograms(store, owner)
        const enrollmentOf = (programId: ProgramId) =>
          Option.orElse(
            Arr.findFirst(all, (e) => e.programId === programId && isRunning(e)),
            () => Arr.findFirst(all, (e) => e.programId === programId),
          )
        return [
          ...Arr.map(PROGRAMS, (program) =>
            summarize(program, BUILTIN_META, enrollmentOf(program.programId)),
          ),
          ...Arr.map(rows, (row) =>
            summarize(
              toProgram(row),
              { source: row.source, version: row.version, schedule: Option.some(row.schedule) },
              enrollmentOf(programIdOfRow(row.id)),
            ),
          ),
        ]
      })

    const enroll = (programId: ProgramId) =>
      lock.withPermits(1)(
        withDeps(
          Effect.gen(function* () {
            const existing = yield* enrollmentsWhere(
              `AND "status" IN ('active', 'paused') AND "programId" = ?`,
              programId,
            )
            const found = Arr.head(existing)
            if (Option.isSome(found)) {
              return found.value
            }
            const now = yield* DateTime.now
            const enrollment = yield* newId(ProgramEnrollmentId).pipe(
              Effect.flatMap((id) =>
                Effect.gen(function* () {
                  return yield* ProgramEnrollment.makeEffect({
                    id,
                    userId: yield* owner,
                    createdAt: now,
                    updatedAt: now,
                    deletedAt: Option.none(),
                    programId,
                    startedOn: yield* localToday,
                    status: "active",
                    currentDay: 1,
                    swaps: [],
                  })
                }),
              ),
              Effect.mapError(toStoreError),
            )
            yield* store.write([{ table: "programEnrollment", row: enrollment }], { dirty: true })
            return enrollment
          }),
        ),
      )

    /** Read-modify-write of one non-terminal enrollment; `change` returns `None` for "no write". */
    const updateEnrollment = (
      id: ProgramEnrollmentId,
      change: (enrollment: ProgramEnrollment) => Option.Option<Partial<ProgramEnrollment>>,
    ) =>
      lock.withPermits(1)(
        Effect.gen(function* () {
          const enrollment = yield* byId(id)
          if (enrollment.status === "completed" || enrollment.status === "abandoned") {
            return yield* Effect.fail(
              toStoreError(new EnrollmentTerminal({ id, status: enrollment.status })),
            )
          }
          const patch = change(enrollment)
          if (Option.isNone(patch)) {
            return enrollment
          }
          const now = yield* DateTime.now
          const row = yield* ProgramEnrollment.makeEffect({
            ...enrollment,
            ...patch.value,
            updatedAt: now,
          }).pipe(Effect.mapError(toStoreError))
          yield* store.write([{ table: "programEnrollment", row }], { dirty: true })
          return row
        }),
      )

    const setStatus = (id: ProgramEnrollmentId, status: SettableStatus) =>
      updateEnrollment(id, (enrollment) =>
        enrollment.status === status ? Option.none() : Option.some({ status }),
      )

    const setSwap = (id: ProgramEnrollmentId, from: CatalogId, to: Option.Option<CatalogId>) =>
      updateEnrollment(id, (enrollment) => {
        const kept = Arr.filter(enrollment.swaps, (swap) => swap.from !== from)
        const target = Option.filter(to, (catalogId) => catalogId !== from)
        const swaps = Option.match(target, {
          onNone: () => kept,
          onSome: (catalogId) => [...kept, { from, to: catalogId }],
        })
        // Same pairs as before (a revert of a never-swapped id, the same from → to again): no write.
        const unchanged =
          swaps.length === enrollment.swaps.length &&
          Arr.every(swaps, (next) =>
            Arr.some(enrollment.swaps, (swap) => swap.from === next.from && swap.to === next.to),
          )
        return unchanged ? Option.none() : Option.some({ swaps })
      })

    const programRow = (id: UserProgramId) =>
      owner.pipe(
        Effect.flatMap((userId) =>
          store.all(
            q(
              `SELECT * FROM "program" WHERE "userId" = ? AND lower("id") = ? AND "deletedAt" IS NULL`,
              userId,
              id.toLowerCase(),
            ),
          ),
        ),
        Effect.flatMap(decodeRecords(UserProgramRow)),
        Effect.map(Arr.head),
      )

    const save = (row: UserProgram) =>
      lock.withPermits(1)(
        Effect.gen(function* () {
          const now = yield* DateTime.now
          const userId = yield* owner
          const previous = yield* programRow(row.id)
          const saved = yield* UserProgram.makeEffect(
            Option.match(previous, {
              onNone: () => ({ ...row, userId, updatedAt: now, deletedAt: Option.none() }),
              onSome: (prev) => ({
                ...row,
                // The stored spelling of the id (a row written elsewhere may be upper-case).
                id: prev.id,
                userId,
                createdAt: prev.createdAt,
                updatedAt: now,
                deletedAt: Option.none(),
                slug: prev.slug,
                source: prev.source,
                version: prev.version + 1,
              }),
            }),
          ).pipe(Effect.mapError(toStoreError))
          yield* store.write([{ table: "program", row: saved }], { dirty: true })
          return saved
        }),
      )

    const deleteProgram = (id: UserProgramId) =>
      lock.withPermits(1)(
        Effect.gen(function* () {
          const found = yield* programRow(id)
          if (Option.isNone(found)) {
            return yield* Effect.fail(toStoreError(new ProgramNotFound({ id })))
          }
          const inUse = Arr.head(
            yield* enrollmentsWhere(
              `AND "status" IN ('active', 'paused') AND "programId" = ?`,
              programIdOfRow(found.value.id),
            ),
          )
          if (Option.isSome(inUse)) {
            return yield* Effect.fail(
              toStoreError(new ProgramInUse({ id, enrollmentId: inUse.value.id })),
            )
          }
          const now = yield* DateTime.now
          const row = yield* UserProgram.makeEffect({
            ...found.value,
            updatedAt: now,
            deletedAt: Option.some(now),
          }).pipe(Effect.mapError(toStoreError))
          yield* store.write([{ table: "program", row }], { dirty: true })
        }),
      )

    const liveCompletion = (input: CompletionInput) =>
      store
        .all(
          q(
            `SELECT * FROM "program_day_completion"
             WHERE "enrollmentId" = ? AND "dayNumber" = ? AND "deletedAt" IS NULL
             ORDER BY "createdAt", "id" LIMIT 1`,
            input.enrollmentId,
            input.dayNumber,
          ),
        )
        .pipe(Effect.flatMap(decodeRecords(ProgramDayCompletionRow)), Effect.map(Arr.head))

    /** `ensure` for one catalog id; a failure is logged and skips that id's sets. */
    const linkOrSkip = (catalogId: CatalogId) =>
      link.ensure(catalogId).pipe(
        Effect.map(Option.some),
        Effect.catch((error) =>
          Effect.logWarning(`ProgramRepo: sets of ${catalogId} not logged`, error).pipe(
            Effect.as(Option.none<ExerciseId>()),
          ),
        ),
      )

    /**
     * The day (swaps applied) as an ordinary session plus its sets (§5), not yet written. `None`
     * (with a logged warning) when the day is unknown, no catalog id could be linked, or a row fails
     * its schema.
     */
    const historyFor = (enrollment: ProgramEnrollment, input: CompletionInput, now: DateTime.Utc) =>
      Effect.gen(function* () {
        const userId = enrollment.userId
        const found = Option.flatMap(yield* find(enrollment.programId), (program) =>
          Option.map(dayOf(program, input.dayNumber), (day) => ({
            program,
            day: applySwaps(day, enrollment.swaps),
          })),
        )
        if (Option.isNone(found)) {
          yield* Effect.logWarning(
            `ProgramRepo: no day ${input.dayNumber} in ${enrollment.programId}`,
          )
          return Option.none()
        }
        const { program, day } = found.value
        const all = plannedItems(day)
        /** Only item-rounds whose work phase finished are logged (an early Finish logs fewer). */
        const performed = Arr.map(
          Arr.take(all, Math.min(Math.max(Math.floor(input.performedItems), 0), all.length)),
          (planned, position) => ({
            ...planned,
            entry: Option.flatten(Arr.get(input.entries, position)),
            // What the player ran in this item-round (a mid-workout swap changes later rounds only).
            catalogId: Option.getOrElse(
              Arr.get(input.performedIds, position),
              () => planned.item.catalogId,
            ),
          }),
        )
        const catalogIds = Arr.dedupe(Arr.map(performed, (planned) => planned.catalogId))
        const links = yield* Effect.forEach(catalogIds, (catalogId) =>
          Effect.map(linkOrSkip(catalogId), (exerciseId) => ({ catalogId, exerciseId })),
        )
        const exerciseFor = (catalogId: CatalogId) =>
          Arr.findFirst(links, (entry) => entry.catalogId === catalogId).pipe(
            Option.flatMap((entry) => entry.exerciseId),
          )
        const kept = Arr.getSomes(
          Arr.map(performed, (planned) =>
            Option.map(exerciseFor(planned.catalogId), (exerciseId) => ({
              ...planned,
              exerciseId,
            })),
          ),
        )
        if (kept.length === 0) {
          return Option.none()
        }
        const startedAt = DateTime.min(input.startedAt, now)
        const session = yield* newId(SessionId).pipe(
          Effect.flatMap((id) =>
            Session.makeEffect({
              id,
              userId,
              createdAt: now,
              updatedAt: now,
              deletedAt: Option.none(),
              startedAt,
              finishedAt: Option.some(now),
              plannedSessionId: Option.none(),
              notes: Option.some(`${program.name} · Day ${input.dayNumber}`),
            }),
          ),
        )
        const sets = yield* Effect.forEach(kept, (planned, order) => {
          // Timed items keep `reps = seconds` (ADR-0007 Q4, ADR-0020); only a weighted round has a load.
          const load = Option.getOrElse(planned.entry, () => ({
            weightKg: 0,
            reps: loggedCount(planned.item),
          }))
          return Effect.all({
            id: newId(SetId),
            weightKg: WeightKg.makeEffect(load.weightKg),
            reps: Reps.makeEffect(load.reps),
          }).pipe(
            Effect.flatMap(({ id, weightKg, reps }) =>
              WorkoutSet.makeEffect({
                id,
                userId,
                createdAt: now,
                updatedAt: now,
                deletedAt: Option.none(),
                sessionId: session.id,
                exerciseId: planned.exerciseId,
                order,
                weightKg,
                reps,
                rpe: Option.none(),
                note: Option.none(),
                plannedSetId: Option.none(),
                loggedAt: DateTime.min(
                  DateTime.add(startedAt, { seconds: planned.endOffset }),
                  now,
                ),
              }),
            ),
          )
        })
        return Option.some({ session, sets })
      }).pipe(
        Effect.catch((issue) =>
          Effect.logWarning("ProgramRepo: session not logged", issue).pipe(
            Effect.as(Option.none()),
          ),
        ),
      )

    const lastLoads = (catalogIds: ReadonlyArray<CatalogId>) =>
      Effect.forEach(Arr.dedupe(Arr.filter(catalogIds, isLoaded)), (catalogId) =>
        linkOrSkip(catalogId).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.succeed(Option.none<WorkoutSet>()),
              // Loaded ids only here: a 0-kg (pre-weights) program row is not a load (§2.7).
              onSome: (exerciseId) => history.lastSet(exerciseId, { loadedOnly: true }),
            }),
          ),
          Effect.map((last) => ({
            catalogId,
            last: Option.map(last, (set): SetEntry => ({ weightKg: set.weightKg, reps: set.reps })),
          })),
        ),
      )

    const complete = (input: CompletionInput) =>
      lock.withPermits(1)(
        withDeps(
          Effect.gen(function* () {
            const enrollment = yield* byId(input.enrollmentId)
            const done = yield* liveCompletion(input)
            if (Option.isSome(done)) {
              return done.value
            }
            if (enrollment.status !== "active") {
              return yield* Effect.fail(
                toStoreError(
                  new EnrollmentNotActive({ id: enrollment.id, status: enrollment.status }),
                ),
              )
            }
            if (input.dayNumber !== enrollment.currentDay) {
              return yield* Effect.fail(
                toStoreError(
                  new DayOutOfOrder({ expected: enrollment.currentDay, got: input.dayNumber }),
                ),
              )
            }
            const now = yield* DateTime.now
            const history = yield* historyFor(enrollment, input, now)
            const historyChanges: ReadonlyArray<SyncChange> = Option.match(history, {
              onNone: () => [],
              onSome: ({ session, sets }) => [
                { table: "session", row: session },
                ...Arr.map(sets, (row): SyncChange => ({ table: "set", row })),
              ],
            })
            const nextDay = input.dayNumber + 1
            const finished = Option.exists(
              yield* find(enrollment.programId),
              (program) => nextDay > program.days.length,
            )
            const completion = yield* newId(ProgramDayCompletionId).pipe(
              Effect.flatMap((id) =>
                ProgramDayCompletion.makeEffect({
                  id,
                  userId: enrollment.userId,
                  createdAt: now,
                  updatedAt: now,
                  deletedAt: Option.none(),
                  enrollmentId: enrollment.id,
                  dayNumber: input.dayNumber,
                  completedAt: now,
                  durationSeconds: input.durationSeconds,
                  sessionId: Option.map(history, ({ session }) => session.id),
                }),
              ),
              Effect.mapError(toStoreError),
            )
            const bumped = yield* ProgramEnrollment.makeEffect({
              ...enrollment,
              currentDay: nextDay,
              status: finished ? "completed" : enrollment.status,
              updatedAt: now,
            }).pipe(Effect.mapError(toStoreError))
            yield* store.write(
              [
                ...historyChanges,
                { table: "programDayCompletion", row: completion },
                { table: "programEnrollment", row: bumped },
              ],
              { dirty: true },
            )
            return completion
          }),
        ),
      )

    return {
      find,
      list,
      enrollments,
      activeEnrollments,
      dueToday,
      enroll,
      setStatus,
      setSwap,
      todayFor,
      findRow: programRow,
      save,
      deleteProgram,
      complete,
      lastLoads,
    }
  })

export class ProgramRepo extends Context.Service<ProgramRepo, ProgramRepoShape>()(
  "@tanren/ProgramRepo",
) {
  /** Against a given finder (tests pass a fixture). */
  static readonly layerWith = (find: ProgramFinder) =>
    Layer.effect(this, make(find)).pipe(Layer.provide(HistoryRepo.layer))

  /**
   * Built-ins then the owner's `program` rows.
   * Needs LocalStore | CurrentUser | IdGenerator | DateTime.CurrentTimeZone | ExerciseLink;
   * `HistoryRepo` (`lastLoads` reads its `lastSet`) is built in, it needs only `LocalStore`.
   */
  static readonly layerNoDeps = Layer.effect(this, Effect.flatMap(storeFinder, make)).pipe(
    Layer.provide(HistoryRepo.layer),
  )
}
