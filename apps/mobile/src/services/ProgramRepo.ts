import {
  type CatalogId,
  type DayNumber,
  type ExerciseId,
  findProgram,
  IdGenerator,
  newId,
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
  Reps,
  SECONDS_PER_REP,
  Session,
  SessionId,
  SetId,
  type SyncChange,
  type UserId,
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
import { decodeRecords, LocalStore } from "./LocalStore"
import { StoreError } from "./SqlDriver"
import { localToday } from "./TodayRepo"

export interface CompletionInput {
  readonly enrollmentId: ProgramEnrollmentId
  readonly dayNumber: DayNumber
  /** When the player started; P5 uses it for the logged session. */
  readonly startedAt: DateTime.Utc
  readonly durationSeconds: number
}

/** Internal: the enrollment is unknown, tombstoned or not the owner's. Carried as `StoreError.cause`. */
/** Internal: `complete` on an enrollment that is `abandoned` or `completed`. Carried as `StoreError.cause`. */
export class EnrollmentNotActive extends Data.TaggedError("EnrollmentNotActive")<{
  readonly id: ProgramEnrollmentId
  readonly status: ProgramEnrollment["status"]
}> {}

export class EnrollmentNotFound extends Data.TaggedError("EnrollmentNotFound")<{
  readonly id: ProgramEnrollmentId
}> {}

export interface ProgramRepoShape {
  /** Every live (not tombstoned) enrollment of the owner, any status, newest first. */
  readonly enrollments: Effect.Effect<ReadonlyArray<ProgramEnrollment>, StoreError>
  /** The newest live enrollment with status `active`, any program. */
  readonly active: Effect.Effect<Option.Option<ProgramEnrollment>, StoreError>
  /** Returns the live active enrollment for `programId` if there is one, else starts one today. */
  readonly enroll: (programId: ProgramId) => Effect.Effect<ProgramEnrollment, StoreError>
  /** Sets status `abandoned`; fails with `StoreError(EnrollmentNotFound)` for an unknown id. */
  readonly abandon: (id: ProgramEnrollmentId) => Effect.Effect<void, StoreError>
  /** The day to do next; `None` past the last day or for an unknown program. */
  readonly todayFor: (enrollment: ProgramEnrollment) => Option.Option<ProgramDay>
  /**
   * Records the day and moves `currentDay` to `dayNumber + 1` (status `completed` past the last
   * day). Also logs the day as an ordinary session with one set per item per round (v2-programs.md
   * §5); the completion's `sessionId` points at it, or is `None` when nothing could be logged.
   * Session, sets, completion and enrollment go dirty in one batch (exercise links are written by
   * `ExerciseLink.ensure` just before). Logging never fails the call. A second call for a day that
   * already has a live completion returns that one and writes nothing. Otherwise a non-`active`
   * enrollment fails with `StoreError(EnrollmentNotActive)`, writing nothing; `currentDay` never
   * moves backwards (completing an older day keeps it).
   */
  readonly complete: (input: CompletionInput) => Effect.Effect<ProgramDayCompletion, StoreError>
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
 * Every item of every round in order, with its planned end: the work and rests before it plus its
 * own work, by the same rule as `dayDurationSeconds` (the last item of the final round ends at it).
 */
export const plannedItems = (day: ProgramDay): ReadonlyArray<PlannedItem> => {
  const works = Arr.map(day.items, workSeconds)
  const rests = Arr.map(day.items, (item) => item.restSeconds)
  const roundLength = sum(works) + sum(Arr.dropRight(rests, 1)) + day.restBetweenRoundsSeconds
  return Arr.flatMap(Arr.range(0, day.rounds - 1), (round) =>
    Arr.map(day.items, (item, index) => ({
      item,
      endOffset:
        round * roundLength + sum(Arr.take(works, index + 1)) + sum(Arr.take(rests, index)),
    })),
  )
}

/** Builds the repo against a program catalog; the app uses `findProgram`, tests a fixture. */
const make = (find: (id: ProgramId) => Option.Option<Program>) =>
  Effect.gen(function* () {
    const store = yield* LocalStore
    const ids = yield* IdGenerator
    const zone = yield* DateTime.CurrentTimeZone
    /** Writes are read-modify-write: one at a time, so a double tap cannot enrol twice. */
    const lock = yield* Semaphore.make(1)
    const owner = ownerId(yield* CurrentUser)
    const link = yield* ExerciseLink
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
    const active = enrollmentsWhere(`AND "status" = 'active'`).pipe(Effect.map(Arr.head))

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

    const enroll = (programId: ProgramId) =>
      lock.withPermits(1)(
        withDeps(
          Effect.gen(function* () {
            const existing = yield* enrollmentsWhere(
              `AND "status" = 'active' AND "programId" = ?`,
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

    const abandon = (id: ProgramEnrollmentId) =>
      lock.withPermits(1)(
        Effect.gen(function* () {
          const enrollment = yield* byId(id)
          const now = yield* DateTime.now
          const row = yield* ProgramEnrollment.makeEffect({
            ...enrollment,
            status: "abandoned",
            updatedAt: now,
          }).pipe(Effect.mapError(toStoreError))
          yield* store.write([{ table: "programEnrollment", row }], { dirty: true })
        }),
      )

    const todayFor = (enrollment: ProgramEnrollment) =>
      find(enrollment.programId).pipe(
        Option.flatMap((program) => dayOf(program, enrollment.currentDay)),
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
     * The day as an ordinary session plus its sets (§5), not yet written. `None` (with a logged
     * warning) when the day is unknown, no catalog id could be linked, or a row fails its schema.
     */
    const historyFor = (
      programId: ProgramId,
      userId: UserId,
      input: CompletionInput,
      now: DateTime.Utc,
    ) =>
      Effect.gen(function* () {
        const found = find(programId).pipe(
          Option.flatMap((program) =>
            Option.map(dayOf(program, input.dayNumber), (day) => ({ program, day })),
          ),
        )
        if (Option.isNone(found)) {
          yield* Effect.logWarning(`ProgramRepo: no day ${input.dayNumber} in ${programId}`)
          return Option.none()
        }
        const { program, day } = found.value
        const catalogIds = Arr.dedupe(Arr.map(day.items, (item) => item.catalogId))
        const links = yield* Effect.forEach(catalogIds, (catalogId) =>
          Effect.map(linkOrSkip(catalogId), (exerciseId) => ({ catalogId, exerciseId })),
        )
        const exerciseFor = (catalogId: CatalogId) =>
          Arr.findFirst(links, (entry) => entry.catalogId === catalogId).pipe(
            Option.flatMap((entry) => entry.exerciseId),
          )
        const kept = Arr.getSomes(
          Arr.map(plannedItems(day), (planned) =>
            Option.map(exerciseFor(planned.item.catalogId), (exerciseId) => ({
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
        const weightKg = yield* WeightKg.makeEffect(0)
        const sets = yield* Effect.forEach(kept, (planned, order) =>
          Effect.all({ id: newId(SetId), reps: Reps.makeEffect(loggedCount(planned.item)) }).pipe(
            Effect.flatMap(({ id, reps }) =>
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
          ),
        )
        return Option.some({ session, sets })
      }).pipe(
        Effect.catch((issue) =>
          Effect.logWarning("ProgramRepo: session not logged", issue).pipe(
            Effect.as(Option.none()),
          ),
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
            const now = yield* DateTime.now
            const history = yield* historyFor(enrollment.programId, enrollment.userId, input, now)
            const historyChanges: ReadonlyArray<SyncChange> = Option.match(history, {
              onNone: () => [],
              onSome: ({ session, sets }) => [
                { table: "session", row: session },
                ...Arr.map(sets, (row): SyncChange => ({ table: "set", row })),
              ],
            })
            /** Completing an older day never moves the enrollment backwards. */
            const nextDay = Math.max(enrollment.currentDay, input.dayNumber + 1)
            const finished = find(enrollment.programId).pipe(
              Option.exists((program) => nextDay > program.days.length),
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

    return { enrollments, active, enroll, abandon, todayFor, complete }
  })

export class ProgramRepo extends Context.Service<ProgramRepo, ProgramRepoShape>()(
  "@tanren/ProgramRepo",
) {
  /** Against a given program catalog (tests pass a fixture `Program`). */
  static readonly layerWith = (find: (id: ProgramId) => Option.Option<Program>) =>
    Layer.effect(this, make(find))

  /** Needs LocalStore | CurrentUser | IdGenerator | DateTime.CurrentTimeZone | ExerciseLink. */
  static readonly layerNoDeps = this.layerWith(findProgram)
}
