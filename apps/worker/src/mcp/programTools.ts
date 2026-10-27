import { UserProgramRepo } from "@tanren/db"
import {
  CATALOG,
  type CatalogId,
  DeleteProgramInput,
  DeleteProgramResult,
  dayDurationSeconds,
  type EnrollmentSummary,
  EnrollProgramInput,
  EnrollProgramResult,
  Forbidden,
  findCatalogExercise,
  GetProgramInput,
  GetProgramProgressInput,
  ListProgramsInput,
  minutesPerDay,
  NotFound,
  newId,
  PROGRAMS,
  type Program,
  type ProgramDay,
  type ProgramDayCompletion,
  ProgramDays,
  ProgramDetail,
  ProgramEnrollment,
  ProgramEnrollmentId,
  type ProgramId,
  type ProgramItem,
  ProgramList,
  ProgramProgress,
  type ProgramSchedule,
  type ProgramSource,
  programIdOfRow,
  SetEnrollmentStatusInput,
  SetEnrollmentStatusResult,
  SWAP_CANDIDATE_LIMIT,
  SwapExerciseInput,
  SwapExerciseResult,
  summarize,
  swapCandidates,
  toProgram,
  UpdateProgramInput,
  UpdateProgramResult,
  type UserId,
  UserProgram,
  UserProgramId,
  ValidationError,
  WriteProgramInput,
  WriteProgramResult,
} from "@tanren/shared"
import { Array as Arr, DateTime, Effect, Option, Order, Schema } from "effect"
import { ProfileRepo } from "../repos"
import { localDayOf } from "../time/localDate"
import { type AnyTool, eraseTool, type Tool, type ToolError } from "./tools"

// The MCP program tools (docs/design/programs-mcp.md §3, ADR-0026). Built-in programs are static
// shared data (`PROGRAMS`, read-only); the user's own programs are `program` rows reached through
// `UserProgramRepo`. Every check runs before the first write.

/** MCP annotations of the program write tools (programs-mcp.md §3); `server.ts` reads them. */
export const programWriteAnnotations = {
  write_program: { readOnlyHint: false, idempotentHint: true, destructiveHint: true },
  update_program: { readOnlyHint: false, idempotentHint: true, destructiveHint: true },
  delete_program: { readOnlyHint: false, idempotentHint: false, destructiveHint: true },
  enroll_program: { readOnlyHint: false, idempotentHint: true, destructiveHint: false },
  set_enrollment_status: { readOnlyHint: false, idempotentHint: true, destructiveHint: false },
  swap_exercise: { readOnlyHint: false, idempotentHint: true, destructiveHint: false },
} as const

const BUILT_IN_READ_ONLY = "built-in programs are read-only"
/**
 * A device push landed between this tool's read and its write (`UserProgramRepo.put` fails with
 * `PersistenceError` naming `conflict <id>`, nothing written): the whole read-modify-write runs
 * once more on the fresh row.
 */
const isConflict = (error: ToolError): boolean =>
  error._tag === "PersistenceError" &&
  Array.isArray(error.cause) &&
  error.cause.some(
    (reason: unknown) => typeof reason === "string" && reason.startsWith("conflict "),
  )

const retryOnConflict = <A, R>(attempt: Effect.Effect<A, ToolError, R>) =>
  Effect.retry(attempt, { times: 1, while: isConflict })

/** A day longer than this many minutes earns a warning. */
const MAX_DAY_MINUTES = 60

/** A program as the tools see it: a built-in or one of the user's rows. */
interface Resolved {
  readonly program: Program
  readonly source: ProgramSource
  readonly version: number
  readonly schedule: Option.Option<ProgramSchedule>
  readonly row: Option.Option<UserProgram>
}

const builtinResolved = (program: Program): Resolved => ({
  program,
  source: "builtin",
  version: 1,
  schedule: Option.none(),
  row: Option.none(),
})

const rowResolved = (row: UserProgram): Resolved => ({
  program: toProgram(row),
  source: row.source,
  version: row.version,
  schedule: Option.some(row.schedule),
  row: Option.some(row),
})

const isBuiltin = (programId: string): boolean =>
  Arr.some(PROGRAMS, (program) => program.programId === programId)

/** Built-ins first, then the user's live rows by title (1 statement). */
const loadAll = Effect.fn("loadPrograms")(function* (userId: UserId) {
  const rows = yield* (yield* UserProgramRepo).list(userId)
  return Arr.appendAll(Arr.map(PROGRAMS, builtinResolved), Arr.map(rows, rowResolved))
})

const lookup = (all: ReadonlyArray<Resolved>, programId: ProgramId): Option.Option<Resolved> =>
  Arr.findFirst(all, (resolved) => resolved.program.programId === programId)

const resolve = Effect.fn("resolveProgram")(function* (userId: UserId, programId: ProgramId) {
  return lookup(yield* loadAll(userId), programId)
})

const isOpen = (enrollment: ProgramEnrollment): boolean =>
  enrollment.status === "active" || enrollment.status === "paused"

/** The enrollment a program row shows: active, else paused, else the newest. */
const shownEnrollment = (
  enrollments: ReadonlyArray<ProgramEnrollment>,
  programId: ProgramId,
): Option.Option<ProgramEnrollment> => {
  const own = Arr.filter(enrollments, (enrollment) => enrollment.programId === programId)
  return Option.orElse(
    Arr.findFirst(own, (enrollment) => enrollment.status === "active"),
    () =>
      Option.orElse(
        Arr.findFirst(own, (enrollment) => enrollment.status === "paused"),
        () => Arr.head(own),
      ),
  )
}

const newestFirst = Order.flip(DateTime.Order)

/** The summary of an enrollment whose completions the caller already read. */
const summaryFrom = (
  enrollment: ProgramEnrollment,
  resolved: Option.Option<Resolved>,
  completions: ReadonlyArray<ProgramDayCompletion>,
): EnrollmentSummary => ({
  enrollmentId: enrollment.id,
  programId: enrollment.programId,
  title: Option.match(resolved, {
    onNone: () => enrollment.programId,
    onSome: (r) => r.program.name,
  }),
  status: enrollment.status,
  startedOn: enrollment.startedOn,
  currentDay: enrollment.currentDay,
  totalDays: Option.match(resolved, { onNone: () => 0, onSome: (r) => r.program.days.length }),
  completedDays: completions.length,
  lastCompletedAt: Arr.head(
    Arr.sort(
      Arr.map(completions, (completion) => completion.completedAt),
      newestFirst,
    ),
  ),
  swaps: enrollment.swaps,
})

/** One `completions` statement per enrollment. */
const summaryOf = Effect.fn("enrollmentSummary")(function* (
  userId: UserId,
  enrollment: ProgramEnrollment,
  resolved: Option.Option<Resolved>,
) {
  return summaryFrom(
    enrollment,
    resolved,
    yield* (yield* UserProgramRepo).completions(userId, enrollment.id),
  )
})

const summariesOf = (
  userId: UserId,
  enrollments: ReadonlyArray<ProgramEnrollment>,
  all: ReadonlyArray<Resolved>,
) =>
  Effect.forEach(enrollments, (enrollment) =>
    summaryOf(userId, enrollment, lookup(all, enrollment.programId)),
  )

// Write-side checks

/** The first catalog id the program names that the catalog lacks → `NotFound catalogExercise`. */
const checkCatalog = Effect.fn("checkCatalog")(function* (
  days: ReadonlyArray<{ readonly items: ReadonlyArray<{ readonly catalogId: CatalogId }> }>,
) {
  const unknown = Arr.findFirst(
    Arr.flatMap(days, (day) => day.items),
    (item) => Option.isNone(findCatalogExercise(item.catalogId)),
  )
  if (Option.isSome(unknown)) {
    return yield* new NotFound({ entity: "catalogExercise", id: unknown.value.catalogId })
  }
})

/** Input days (dayNumber = position) as validated `ProgramDay`s. */
const buildDays = (days: WriteProgramInput["days"]) =>
  Schema.decodeUnknownEffect(ProgramDays)(
    Arr.map(days, (day, index) => ({ ...day, dayNumber: index + 1 })),
  ).pipe(Effect.mapError(ValidationError.fromSchemaError))

/** Strings, never errors (programs-mcp.md §3). */
const warningsFor = (
  days: ReadonlyArray<ProgramDay>,
  enrollments: ReadonlyArray<ProgramEnrollment>,
): ReadonlyArray<string> => {
  const perDay = Arr.flatMap(days, (day) => {
    const minutes = Math.round(dayDurationSeconds(day) / 60)
    const ids = Arr.map(day.items, (item) => item.catalogId)
    const repeated = Arr.filter(
      Arr.dedupe(ids),
      (id) => Arr.filter(ids, (x) => x === id).length > 1,
    )
    return [
      ...(minutes > MAX_DAY_MINUTES
        ? [`day ${day.dayNumber} runs ${minutes} min (> ${MAX_DAY_MINUTES})`]
        : []),
      ...Arr.map(repeated, (id) => `day ${day.dayNumber} repeats ${id}`),
    ]
  })
  const items: ReadonlyArray<ProgramItem> = Arr.flatMap(days, (day) => day.items)
  const kinds = Arr.dedupe(
    Arr.flatMap(
      items,
      (item): ReadonlyArray<string> =>
        Option.match(findCatalogExercise(item.catalogId), {
          onNone: () => [],
          onSome: (entry) =>
            entry.kind === "distance" || entry.kind === item.kind
              ? []
              : [`${item.catalogId} is a ${entry.kind} exercise used as ${item.kind}`],
        }),
    ),
  )
  const past = Arr.flatMap(enrollments, (enrollment) =>
    isOpen(enrollment) && enrollment.currentDay > days.length
      ? [
          `enrollment ${enrollment.id} is on day ${enrollment.currentDay} > days (${days.length}): the app shows the program as finished`,
        ]
      : [],
  )
  return [...perDay, ...kinds, ...past]
}

const toResult = (row: UserProgram, created: boolean, warnings: ReadonlyArray<string>) => ({
  programId: programIdOfRow(row.id),
  created,
  version: row.version,
  days: row.days.length,
  minutesPerDay: minutesPerDay(row.days),
  warnings,
})

// Reads

export const listPrograms: Tool<typeof ListProgramsInput, typeof ProgramList> = {
  name: "list_programs",
  kind: "read",
  description:
    "Lists every guided program (the built-ins first, then the user's own by title) with its day " +
    "count, minutes per day, schedule and the user's current enrollment in it, if any.",
  input: ListProgramsInput,
  output: ProgramList,
  run: Effect.fn("list_programs")(function* (userId: UserId) {
    const all = yield* loadAll(userId)
    const enrollments = yield* (yield* UserProgramRepo).enrollments(userId)
    return {
      programs: Arr.map(all, (resolved) =>
        summarize(
          resolved.program,
          resolved,
          shownEnrollment(enrollments, resolved.program.programId),
        ),
      ),
    }
  }),
}

export const getProgram: Tool<typeof GetProgramInput, typeof ProgramDetail> = {
  name: "get_program",
  kind: "read",
  description:
    "Returns one program in full (every day, round and exercise with its target) and the user's " +
    "enrollments in it. Errors: NotFound program (an unknown programId; ids come from list_programs).",
  input: GetProgramInput,
  output: ProgramDetail,
  run: Effect.fn("get_program")(function* (userId: UserId, input: GetProgramInput) {
    const all = yield* loadAll(userId)
    const found = lookup(all, input.programId)
    if (Option.isNone(found)) {
      return yield* new NotFound({ entity: "program", id: input.programId })
    }
    const enrollments = yield* (yield* UserProgramRepo).enrollments(userId, input.programId)
    return {
      program: found.value.program,
      source: found.value.source,
      version: found.value.version,
      schedule: found.value.schedule,
      enrollments: yield* summariesOf(userId, enrollments, all),
    }
  }),
}

export const getProgramProgress: Tool<typeof GetProgramProgressInput, typeof ProgramProgress> = {
  name: "get_program_progress",
  kind: "read",
  description:
    "Returns the user's enrollments (status, current day, completed days, swaps) for one program " +
    "or for all of them, plus every completed day when programId is given (a paused enrollment is " +
    "reported as paused). currentDay is the first day not completed; days are sequential, a " +
    "missed calendar day is not skipped, and at most one day completes per calendar day.",
  input: GetProgramProgressInput,
  output: ProgramProgress,
  run: Effect.fn("get_program_progress")(function* (
    userId: UserId,
    input: GetProgramProgressInput,
  ) {
    const repo = yield* UserProgramRepo
    const all = yield* loadAll(userId)
    const enrollments = yield* repo.enrollments(userId, input.programId)
    // One `completions` read per enrollment feeds both the summary and the day list.
    const rows = yield* Effect.forEach(enrollments, (enrollment) =>
      Effect.map(repo.completions(userId, enrollment.id), (completions) => ({
        enrollment,
        completions,
      })),
    )
    return {
      enrollments: Arr.map(rows, ({ enrollment, completions }) =>
        summaryFrom(enrollment, lookup(all, enrollment.programId), completions),
      ),
      completions:
        input.programId === undefined
          ? []
          : Arr.flatMap(rows, ({ completions }) =>
              Arr.map(completions, (row) => ({
                enrollmentId: row.enrollmentId,
                dayNumber: row.dayNumber,
                completedAt: row.completedAt,
                durationSeconds: row.durationSeconds,
              })),
            ),
    }
  }),
}

// Writes

const upsert = Effect.fn("writeProgram")(function* (
  userId: UserId,
  existing: Option.Option<UserProgram>,
  fields: {
    readonly slug: UserProgram["slug"]
    readonly title: UserProgram["title"]
    readonly summary: UserProgram["summary"]
    readonly description: UserProgram["description"]
    readonly days: ProgramDays
    readonly schedule: UserProgram["schedule"]
  },
) {
  const repo = yield* UserProgramRepo
  const now = yield* DateTime.now
  const id = Option.match(existing, {
    onNone: () => newId(UserProgramId),
    onSome: (row) => Effect.succeed(row.id),
  })
  const row = yield* UserProgram.makeEffect({
    id: yield* id,
    userId,
    createdAt: Option.match(existing, { onNone: () => now, onSome: (r) => r.createdAt }),
    updatedAt: now,
    deletedAt: Option.none(),
    ...fields,
    source: Option.match(existing, { onNone: () => "mcp" as const, onSome: (r) => r.source }),
    version: Option.match(existing, { onNone: () => 1, onSome: (r) => r.version + 1 }),
  }).pipe(Effect.mapError(ValidationError.fromIssue))
  yield* repo.put(userId, row)
  const enrollments = yield* repo.enrollments(userId, programIdOfRow(row.id))
  return toResult(row, Option.isNone(existing), warningsFor(fields.days, enrollments))
})

export const writeProgram: Tool<typeof WriteProgramInput, typeof WriteProgramResult> = {
  name: "write_program",
  kind: "write",
  description:
    "Create or replace one of the user's guided programs (replace = same slug; the id and " +
    "enrollments are kept). A program is 1–84 days; each day has 1–12 exercises done for 1–5 " +
    'rounds. Use `search_exercises` to get `catalogId`s — never invent ids. Use `kind: "timed"` ' +
    '(10–600 s) only for holds, isometrics and cardio (plank, wall sit, bike); use `kind: "reps"` ' +
    "(1–100) for everything else, with `sets` (1–10, default 1) straight sets and `restSeconds` " +
    "between them; `rounds` repeats the whole day as a circuit and is 1 for a gym day. Rest " +
    "15–30 s for core items, 60–150 s for heavy lifts, 0 for cardio. Weeks are 7 days with 1–2 " +
    "recovery days; progress by reps, seconds or sets, not new exercises daily. Keep a day ≤ 60 " +
    "min (the result reports min/max minutes). Errors: ValidationError (field path + rule), NotFound " +
    "catalogExercise (an id you made up), Forbidden (built-in slug).",
  input: WriteProgramInput,
  output: WriteProgramResult,
  run: Effect.fn("write_program")(function* (userId: UserId, input: WriteProgramInput) {
    if (isBuiltin(input.slug)) {
      return yield* new Forbidden({ message: BUILT_IN_READ_ONLY })
    }
    yield* checkCatalog(input.days)
    const days = yield* buildDays(input.days)
    return yield* retryOnConflict(
      Effect.gen(function* () {
        const existing = yield* (yield* UserProgramRepo).bySlug(userId, input.slug)
        return yield* upsert(userId, existing, {
          slug: input.slug,
          title: input.title,
          summary: input.summary,
          description: Option.fromNullishOr(input.description),
          days,
          schedule: input.schedule,
        })
      }),
    )
  }),
}

const isEmptyPatch = (input: UpdateProgramInput): boolean =>
  input.title === undefined &&
  input.summary === undefined &&
  input.description === undefined &&
  input.days === undefined &&
  input.schedule === undefined

export const updateProgram: Tool<typeof UpdateProgramInput, typeof UpdateProgramResult> = {
  name: "update_program",
  kind: "write",
  description:
    "Patches one of the user's own programs (title, summary, description, schedule, or the whole " +
    "`days` list, which is replaced, not merged; items take `sets` as in `write_program`); " +
    "omitted fields stay as they are. Errors: " +
    "Forbidden (a built-in program), NotFound program or catalogExercise, ValidationError " +
    "(empty patch, or a field rule).",
  input: UpdateProgramInput,
  output: UpdateProgramResult,
  run: Effect.fn("update_program")(function* (userId: UserId, input: UpdateProgramInput) {
    if (isBuiltin(input.programId)) {
      return yield* new Forbidden({ message: BUILT_IN_READ_ONLY })
    }
    if (isEmptyPatch(input)) {
      return yield* new ValidationError({ message: "empty patch", issues: [] })
    }
    if (input.days !== undefined) {
      yield* checkCatalog(input.days)
    }
    const newDays =
      input.days === undefined ? Option.none() : Option.some(yield* buildDays(input.days))
    // Read, patch and write as one unit, so a conflict retry patches the fresh row.
    return yield* retryOnConflict(
      Effect.gen(function* () {
        const found = yield* resolve(userId, input.programId)
        const existing = Option.flatMap(found, (resolved) => resolved.row)
        if (Option.isNone(existing)) {
          return yield* new NotFound({ entity: "program", id: input.programId })
        }
        const row = existing.value
        return yield* upsert(userId, existing, {
          slug: row.slug,
          title: input.title ?? row.title,
          summary: input.summary ?? row.summary,
          description: input.description ?? row.description,
          days: Option.getOrElse(newDays, () => row.days),
          schedule: input.schedule ?? row.schedule,
        })
      }),
    )
  }),
}

/** Moves an enrollment to a new state; the repo stamps `updatedAt` past the stored row. */
const saveEnrollment = Effect.fn("saveEnrollment")(function* (
  userId: UserId,
  enrollment: ProgramEnrollment,
  changes: Partial<Pick<ProgramEnrollment, "status" | "swaps">>,
) {
  const next = yield* ProgramEnrollment.makeEffect({
    ...enrollment,
    ...changes,
    updatedAt: yield* DateTime.now,
  }).pipe(Effect.mapError(ValidationError.fromIssue))
  yield* (yield* UserProgramRepo).putEnrollment(userId, next)
  return next
})

export const deleteProgram: Tool<typeof DeleteProgramInput, typeof DeleteProgramResult> = {
  name: "delete_program",
  kind: "write",
  description:
    "Soft-deletes one of the user's own programs by programId; with active or paused enrollments " +
    "it refuses unless `force: true`, which abandons them first. Not undoable. Errors: Forbidden " +
    "(a built-in program), ValidationError (open enrollments without force); an already deleted " +
    "program answers deleted: false.",
  input: DeleteProgramInput,
  output: DeleteProgramResult,
  run: Effect.fn("delete_program")(function* (userId: UserId, input: DeleteProgramInput) {
    if (isBuiltin(input.programId)) {
      return yield* new Forbidden({ message: BUILT_IN_READ_ONLY })
    }
    const repo = yield* UserProgramRepo
    const existing = Option.flatMap(yield* resolve(userId, input.programId), (r) => r.row)
    if (Option.isNone(existing)) {
      return { deleted: false, abandonedEnrollments: 0 }
    }
    const open = Arr.filter(yield* repo.enrollments(userId, input.programId), isOpen)
    if (open.length > 0 && input.force !== true) {
      return yield* new ValidationError({
        message: `program has ${open.length} active enrollments; pass force: true to abandon them and delete`,
        issues: [],
      })
    }
    // Not atomic (`UserProgramRepo` has no batch): enrollments are abandoned one by one, then the
    // row is tombstoned. A failure part-way leaves some abandoned and the program live; calling
    // again with `force` abandons the rest and deletes, so a retry heals it.
    yield* Effect.forEach(open, (enrollment) =>
      saveEnrollment(userId, enrollment, { status: "abandoned" }),
    )
    return {
      deleted: yield* repo.softDelete(userId, existing.value.id),
      abandonedEnrollments: open.length,
    }
  }),
}

export const enrollProgram: Tool<typeof EnrollProgramInput, typeof EnrollProgramResult> = {
  name: "enroll_program",
  kind: "write",
  description:
    "Start the user's enrollment in a program today (or `startedOn`). Several programs may be " +
    "active at once; the app's Today lists each active program's next day. Returns the existing " +
    "enrollment if one is already active/paused.",
  input: EnrollProgramInput,
  output: EnrollProgramResult,
  run: Effect.fn("enroll_program")(function* (userId: UserId, input: EnrollProgramInput) {
    const repo = yield* UserProgramRepo
    const all = yield* loadAll(userId)
    const found = lookup(all, input.programId)
    if (Option.isNone(found)) {
      return yield* new NotFound({ entity: "program", id: input.programId })
    }
    const own = yield* repo.enrollments(userId, input.programId)
    const open = Arr.findFirst(own, isOpen)
    if (Option.isSome(open)) {
      return {
        enrollment: yield* summaryOf(userId, open.value, found),
        alreadyActive: true,
      }
    }
    const now = yield* DateTime.now
    const stored = yield* (yield* ProfileRepo).get(userId)
    const timezone = Option.match(
      Option.filter(stored, (profile) => Option.isNone(profile.deletedAt)),
      { onNone: () => "UTC", onSome: (profile) => profile.timezone },
    )
    const enrollment = yield* ProgramEnrollment.makeEffect({
      id: yield* newId(ProgramEnrollmentId),
      userId,
      createdAt: now,
      updatedAt: now,
      deletedAt: Option.none(),
      programId: input.programId,
      startedOn: input.startedOn ?? (yield* localDayOf(now, timezone)),
      status: "active",
      currentDay: 1,
      swaps: [],
    }).pipe(Effect.mapError(ValidationError.fromIssue))
    yield* repo.putEnrollment(userId, enrollment)
    return { enrollment: yield* summaryOf(userId, enrollment, found), alreadyActive: false }
  }),
}

/** The enrollment `enrollmentId` of the caller, else `NotFound programEnrollment`. */
const findEnrollment = Effect.fn("findEnrollment")(function* (
  userId: UserId,
  enrollmentId: ProgramEnrollmentId,
) {
  const found = Arr.findFirst(
    yield* (yield* UserProgramRepo).enrollments(userId),
    (enrollment) => enrollment.id === enrollmentId,
  )
  if (Option.isNone(found)) {
    return yield* new NotFound({ entity: "programEnrollment", id: enrollmentId })
  }
  return found.value
})

export const setEnrollmentStatus: Tool<
  typeof SetEnrollmentStatusInput,
  typeof SetEnrollmentStatusResult
> = {
  name: "set_enrollment_status",
  kind: "write",
  description:
    "Pauses, resumes (active) or abandons one enrollment; completed and abandoned enrollments are " +
    "final. Errors: NotFound programEnrollment, ValidationError (the enrollment is already " +
    "completed or abandoned).",
  input: SetEnrollmentStatusInput,
  output: SetEnrollmentStatusResult,
  run: Effect.fn("set_enrollment_status")(function* (
    userId: UserId,
    input: SetEnrollmentStatusInput,
  ) {
    const enrollment = yield* findEnrollment(userId, input.enrollmentId)
    if (enrollment.status === "completed" || enrollment.status === "abandoned") {
      return yield* new ValidationError({
        message: `enrollment is ${enrollment.status}`,
        issues: [],
      })
    }
    const next =
      enrollment.status === input.status
        ? enrollment
        : yield* saveEnrollment(userId, enrollment, { status: input.status })
    const resolved = yield* resolve(userId, next.programId)
    return { enrollment: yield* summaryOf(userId, next, resolved) }
  }),
}

export const swapExercise: Tool<typeof SwapExerciseInput, typeof SwapExerciseResult> = {
  name: "swap_exercise",
  kind: "write",
  description:
    "Replaces exercise `from` (its id in the program's days) with `to` for one enrollment only; the " +
    "program itself is unchanged, and `to: null` reverts. `to` must be a similar exercise (same " +
    "kind and primary muscle); the result lists the candidates. Errors: NotFound " +
    "programEnrollment or program, ValidationError (`from` is not in the program, or `to` is not a " +
    "candidate).",
  input: SwapExerciseInput,
  output: SwapExerciseResult,
  run: Effect.fn("swap_exercise")(function* (userId: UserId, input: SwapExerciseInput) {
    const enrollment = yield* findEnrollment(userId, input.enrollmentId)
    const found = yield* resolve(userId, enrollment.programId)
    if (Option.isNone(found)) {
      return yield* new NotFound({ entity: "program", id: enrollment.programId })
    }
    const inProgram = Arr.some(
      Arr.flatMap(found.value.program.days, (day) => day.items),
      (item) => item.catalogId === input.from,
    )
    if (!inProgram) {
      return yield* new ValidationError({
        message: `${input.from} is not an exercise of program ${enrollment.programId}`,
        issues: [],
      })
    }
    const original = findCatalogExercise(input.from)
    if (Option.isNone(original)) {
      return yield* new NotFound({ entity: "catalogExercise", id: input.from })
    }
    const candidates = Arr.map(
      swapCandidates(original.value, CATALOG, Option.none()),
      (entry) => entry.catalogId,
    )
    const others = Arr.filter(enrollment.swaps, (swap) => swap.from !== input.from)
    const swaps = yield* Option.match(input.to, {
      onNone: () => Effect.succeed(others),
      onSome: (to) =>
        Arr.contains(candidates, to)
          ? Effect.succeed([...others, { from: input.from, to }])
          : Effect.fail(
              new ValidationError({
                message: `${to} is not a candidate for ${input.from}; candidates: ${Arr.join(Arr.take(candidates, SWAP_CANDIDATE_LIMIT), ", ")}`,
                issues: [],
              }),
            ),
    })
    const saved = yield* saveEnrollment(userId, enrollment, { swaps })
    return { swaps: saved.swaps, candidates }
  }),
}

/** The program read tools, in `MCP_TOOLS` order. */
export const programReadTools: ReadonlyArray<AnyTool> = [
  eraseTool(listPrograms),
  eraseTool(getProgram),
  eraseTool(getProgramProgress),
]

/** The program write tools, in `MCP_TOOLS` order. */
export const programWriteTools: ReadonlyArray<AnyTool> = [
  eraseTool(writeProgram),
  eraseTool(updateProgram),
  eraseTool(deleteProgram),
  eraseTool(enrollProgram),
  eraseTool(setEnrollmentStatus),
  eraseTool(swapExercise),
]
