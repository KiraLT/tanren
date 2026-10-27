import {
  type ProgramDay,
  type ProgramId,
  type ProgramSchedule,
  programIdOfRow,
  UserProgram,
  UserProgramId,
} from "@tanren/shared"
import { Array as Arr, Data, DateTime, Effect, Exit, Option, Schema, Semaphore } from "effect"
import { useCallback, useState } from "react"
import { ProgramRepo } from "../../services/ProgramRepo"
import { failureMessage, runtime } from "../../services/runtime"
import { LOCAL_USER_ID } from "../../store/localUser"
import { blankContent, duplicateContent, newProgramRow } from "./newProgram"
import { defaultSchedule } from "./programEdit"

/** The part of a program the editor changes; everything else on the row is carried over. */
export interface ProgramDraft {
  readonly title: string
  readonly summary: string
  readonly schedule: ProgramSchedule
  readonly days: ReadonlyArray<ProgramDay>
}

export type DraftChange = (draft: ProgramDraft) => ProgramDraft

/** Internal: the program to edit or copy is unknown, a built-in (no row) or was deleted. */
class ProgramMissing extends Data.TaggedError("ProgramMissing")<{
  readonly programId: ProgramId
}> {}

/**
 * One edit at a time: an update reads the stored row, applies its change and saves, so two quick
 * taps (a stepper held down) must not both read the same version.
 */
const updateLock = Semaphore.makeUnsafe(1)

/**
 * `repo.save` of the stored program with `change` applied: version + 1, dirty. The row is read
 * fresh on every call (there is no draft state), so the change always lands on the latest write.
 */
const saveChange = (programId: ProgramId, change: DraftChange) =>
  ProgramRepo.use((repo) =>
    updateLock.withPermits(1)(
      Effect.gen(function* () {
        const id = yield* Schema.decodeUnknownEffect(UserProgramId)(programId).pipe(
          Effect.mapError(() => new ProgramMissing({ programId })),
        )
        const program = yield* repo.find(programId)
        const summaries = yield* repo.list()
        const summary = Arr.findFirst(summaries, (entry) => entry.programId === programId)
        if (
          Option.isNone(program) ||
          Option.isNone(summary) ||
          summary.value.source === "builtin"
        ) {
          return yield* new ProgramMissing({ programId })
        }
        const next = change({
          title: program.value.name,
          // `toProgram` fills a missing description with the summary, so equal means "none".
          summary: program.value.tagline,
          schedule: Option.getOrElse(summary.value.schedule, () =>
            defaultSchedule(program.value.days.length),
          ),
          days: program.value.days,
        })
        const now = yield* DateTime.now
        const description =
          program.value.description === program.value.tagline
            ? Option.none()
            : Option.some(program.value.description)
        const row = yield* UserProgram.makeEffect({
          id,
          userId: LOCAL_USER_ID,
          createdAt: now,
          updatedAt: now,
          deletedAt: Option.none(),
          title: next.title,
          slug: program.value.programId,
          summary: next.summary,
          description,
          days: next.days,
          schedule: next.schedule,
          // `save` keeps the stored slug and source and sets version + 1.
          source: summary.value.source,
          version: summary.value.version,
        })
        return yield* repo.save(row)
      }),
    ),
  )

/** Starts a blank program or a copy of `from` (built-ins included); the new row's `programId`. */
const createProgram = (from: Option.Option<ProgramId>) =>
  ProgramRepo.use((repo) =>
    Effect.gen(function* () {
      const content = yield* Option.match(from, {
        onNone: () => Effect.succeed(blankContent),
        onSome: (programId) =>
          Effect.gen(function* () {
            const program = yield* repo.find(programId)
            const summaries = yield* repo.list()
            const summary = Arr.findFirst(summaries, (entry) => entry.programId === programId)
            if (Option.isNone(program) || Option.isNone(summary)) {
              return yield* new ProgramMissing({ programId })
            }
            return duplicateContent(program.value, summary.value)
          }),
      })
      const saved = yield* repo.save(yield* newProgramRow(content))
      return programIdOfRow(saved.id)
    }),
  )

export interface ProgramUpdate {
  /** Resolves true when the row was saved; false sets `error`. */
  readonly update: (programId: ProgramId, change: DraftChange) => Promise<boolean>
  readonly busy: boolean
  readonly error: Option.Option<string>
}

/** Writes one change to a user program through `ProgramRepo.save` (no draft state). */
export const useProgramUpdate = (): ProgramUpdate => {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Option.Option<string>>(Option.none())
  const update = useCallback((programId: ProgramId, change: DraftChange) => {
    setBusy(true)
    setError(Option.none())
    return runtime.runPromiseExit(saveChange(programId, change)).then((exit) => {
      setBusy(false)
      if (Exit.isFailure(exit)) {
        setError(Option.some(failureMessage(exit.cause)))
      }
      return Exit.isSuccess(exit)
    })
  }, [])
  return { update, busy, error }
}

export interface ProgramCreate {
  /** The new program's id, or `None` after a failure (`error` is set). */
  readonly create: (from: Option.Option<ProgramId>) => Promise<Option.Option<ProgramId>>
  readonly busy: boolean
  readonly error: Option.Option<string>
}

/** Creates a blank or duplicated program row (`source: "manual"`, version 1). */
export const useCreateProgram = (): ProgramCreate => {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Option.Option<string>>(Option.none())
  const create = useCallback((from: Option.Option<ProgramId>) => {
    setBusy(true)
    setError(Option.none())
    return runtime.runPromiseExit(createProgram(from)).then((exit) => {
      setBusy(false)
      if (Exit.isFailure(exit)) {
        setError(Option.some(failureMessage(exit.cause)))
      }
      return Exit.match(exit, { onFailure: () => Option.none(), onSuccess: Option.some })
    })
  }, [])
  return { create, busy, error }
}
