import {
  type ProgramDay,
  type ProgramId,
  type ProgramSchedule,
  programIdOfRow,
  UserProgram,
  UserProgramId,
} from "@tanren/shared"
import { Array as Arr, Data, DateTime, Effect, Exit, Option, Schema, Semaphore } from "effect"
import { useCallback, useMemo, useState } from "react"
import { ProgramRepo } from "../../services/ProgramRepo"
import { failureMessage, runtime } from "../../services/runtime"
import { blankContent, duplicateContent, newProgramRow } from "./newProgram"
import { useWriteGate } from "./useWriteGate"
import type { WriteKind } from "./writeGate"

/** The part of a program the editor changes; everything else on the row is carried over. */
export interface ProgramDraft {
  readonly title: string
  readonly summary: string
  readonly schedule: ProgramSchedule
  readonly days: ReadonlyArray<ProgramDay>
}

/** A change is a function of the stored draft, never of what a screen last rendered. */
export type DraftChange = (draft: ProgramDraft) => ProgramDraft

/** Internal: the program to edit or copy is unknown, a built-in (no row) or was deleted. */
class ProgramMissing extends Data.TaggedError("ProgramMissing")<{
  readonly programId: ProgramId
}> {}

/**
 * One edit at a time: an update reads the stored row, applies its change and saves, so two quick
 * taps queue and the second lands on the first one's result.
 */
const updateLock = Semaphore.makeUnsafe(1)

/**
 * `repo.save` of the stored row with `change` applied: version + 1, dirty. The row is read fresh
 * (`findRow`, description included) on every call, so there is no draft state to go stale.
 */
const saveChange = (programId: ProgramId, change: DraftChange) =>
  ProgramRepo.use((repo) =>
    updateLock.withPermits(1)(
      Effect.gen(function* () {
        const id = yield* Schema.decodeUnknownEffect(UserProgramId)(programId).pipe(
          Effect.mapError(() => new ProgramMissing({ programId })),
        )
        const found = yield* repo.findRow(id)
        if (Option.isNone(found)) {
          return yield* new ProgramMissing({ programId })
        }
        const stored = found.value
        const next = change({
          title: stored.title,
          summary: stored.summary,
          schedule: stored.schedule,
          days: stored.days,
        })
        // `save` keeps createdAt, slug and source, stamps the owner and updatedAt, and sets version + 1.
        return yield* repo.save(
          yield* UserProgram.makeEffect({
            ...stored,
            title: next.title,
            summary: next.summary,
            schedule: next.schedule,
            days: next.days,
            updatedAt: yield* DateTime.now,
          }),
        )
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
  /**
   * Queued: every call applies its change to the row the previous one saved (steppers, add day,
   * text). Resolves true when saved; false sets `error`.
   */
  readonly update: (programId: ProgramId, change: DraftChange) => Promise<boolean>
  /**
   * For changes that address a position (move, remove an item or a day's position): ignored, and
   * resolves false, while any write is in flight (see `writeGate`).
   */
  readonly updateOnce: (programId: ProgramId, change: DraftChange) => Promise<boolean>
  /**
   * For a write after which the screen leaves (remove day, pick an exercise): like `updateOnce`,
   * and once saved it ignores everything until the screen is gone; only a failure unlocks.
   */
  readonly updateAndLeave: (programId: ProgramId, change: DraftChange) => Promise<boolean>
  /**
   * The screen rendered this program version (`summary.version` from `useProgramDetail`). A saved
   * positional write keeps every write ignored until it is called with that version or a later
   * one: until then the list on screen is the old one and its indexes are stale.
   */
  readonly observe: (version: number) => void
  /** True while a write is in flight, awaiting its render, or the screen is leaving. */
  readonly busy: boolean
  readonly error: Option.Option<string>
}

/** Writes changes to a user program through `ProgramRepo.save` (no draft state). */
export const useProgramUpdate = (): ProgramUpdate => {
  const [error, setError] = useState<Option.Option<string>>(Option.none())
  const { enter, settle, observe, busy } = useWriteGate()
  const write = useCallback(
    (kind: WriteKind) => (programId: ProgramId, change: DraftChange) => {
      if (!enter(kind)) {
        return Promise.resolve(false)
      }
      setError(Option.none())
      return runtime.runPromiseExit(saveChange(programId, change)).then((exit) => {
        settle(
          kind,
          Exit.match(exit, {
            onFailure: () => Option.none(),
            onSuccess: (row) => Option.some(row.version),
          }),
        )
        if (Exit.isFailure(exit)) {
          setError(Option.some(failureMessage(exit.cause)))
        }
        return Exit.isSuccess(exit)
      })
    },
    [enter, settle],
  )
  return useMemo(
    () => ({
      update: write("queued"),
      updateOnce: write("positional"),
      updateAndLeave: write("leave"),
      observe,
      busy,
      error,
    }),
    [write, observe, busy, error],
  )
}

export interface ProgramCreate {
  /**
   * The new program's id, or `None` after a failure (`error` is set) or when a create is already
   * running or done: one screen creates at most one program.
   */
  readonly create: (from: Option.Option<ProgramId>) => Promise<Option.Option<ProgramId>>
  readonly busy: boolean
  readonly error: Option.Option<string>
}

/** Creates a blank or duplicated program row (`source: "manual"`, version 1), once per screen. */
export const useCreateProgram = (): ProgramCreate => {
  const [error, setError] = useState<Option.Option<string>>(Option.none())
  const { enter, settle, busy } = useWriteGate()
  const create = useCallback(
    (from: Option.Option<ProgramId>) => {
      // A `leave` write: after a success the screen is replaced by the editor, so it stays locked.
      if (!enter("leave")) {
        return Promise.resolve(Option.none<ProgramId>())
      }
      setError(Option.none())
      return runtime.runPromiseExit(createProgram(from)).then((exit) => {
        // A new row is version 1; the create screen is replaced, so nothing observes it.
        settle("leave", Exit.isSuccess(exit) ? Option.some(1) : Option.none())
        if (Exit.isFailure(exit)) {
          setError(Option.some(failureMessage(exit.cause)))
        }
        return Exit.match(exit, { onFailure: () => Option.none(), onSuccess: Option.some })
      })
    },
    [enter, settle],
  )
  return { create, busy, error }
}
