import type {
  Program,
  ProgramEnrollmentId,
  ProgramId,
  ProgramSummary,
  UserProgramId,
} from "@tanren/shared"
import { Array as Arr, Effect, Exit, Option, Stream } from "effect"
import { useFocusEffect } from "expo-router"
import { useCallback, useEffect, useRef, useState } from "react"
import { type ActiveProgram, ProgramRepo, type SettableStatus } from "../services/ProgramRepo"
import { failureMessage, runtime } from "../services/runtime"
import { StoreEvents } from "../services/StoreEvents"

export type ProgramsState =
  | { readonly _tag: "Loading" }
  | { readonly _tag: "Failed"; readonly message: string }
  | {
      readonly _tag: "Ready"
      /** Built-ins first, then the user's programs by title (`ProgramRepo.list`). */
      readonly summaries: ReadonlyArray<ProgramSummary>
      /** `active` and `paused` enrollments, newest first, swaps applied to `day`. */
      readonly active: ReadonlyArray<ActiveProgram>
    }

const load = ProgramRepo.use((repo) =>
  Effect.all({ summaries: repo.list(), active: repo.activeEnrollments() }).pipe(
    Effect.map(({ summaries, active }): ProgramsState => ({ _tag: "Ready", summaries, active })),
  ),
)

/** Bumps after every local store write (`StoreEvents`); a read effect depends on it to reload. */
export const useStoreVersion = (): number => {
  const [storeVersion, setStoreVersion] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    runtime.runPromiseExit(
      StoreEvents.use((events) =>
        Stream.runForEach(events.changes, (next) => Effect.sync(() => setStoreVersion(next))),
      ),
      { signal: controller.signal },
    )
    return () => controller.abort()
  }, [])
  return storeVersion
}

/**
 * Bumps each time the screen regains focus (blur → focus), never on the first focus, so a read
 * effect that depends on it re-runs on return without a second read at mount. Tabs stay mounted:
 * this is how `doneToday` clears after local midnight (programs-player-v2 §6.3).
 */
export const useRefocusCount = (): number => {
  const [focuses, setFocuses] = useState(0)
  useFocusEffect(
    useCallback(() => {
      setFocuses((count) => count + 1)
    }, []),
  )
  // The first focus (mount) moves 0 → 1 and still reads 0: the mount read already ran.
  return Math.max(0, focuses - 1)
}

export type ProgramDetailState =
  | { readonly _tag: "Loading" }
  | { readonly _tag: "Failed"; readonly message: string }
  | { readonly _tag: "NotFound" }
  | {
      readonly _tag: "Ready"
      readonly program: Program
      readonly summary: ProgramSummary
      /** The live `active` / `paused` enrollment in this program, swaps applied to its day. */
      readonly running: Option.Option<ActiveProgram>
      /** Another program is running (the enrol button then reads "Start alongside"). */
      readonly othersActive: boolean
    }

const loadDetail = (programId: ProgramId) =>
  ProgramRepo.use((repo) =>
    Effect.gen(function* () {
      const program = yield* repo.find(programId)
      const summaries = yield* repo.list()
      const active = yield* repo.activeEnrollments()
      const summary = Arr.findFirst(summaries, (entry) => entry.programId === programId)
      if (Option.isNone(program) || Option.isNone(summary)) {
        return { _tag: "NotFound" } satisfies ProgramDetailState
      }
      return {
        _tag: "Ready",
        program: program.value,
        summary: summary.value,
        running: Arr.findFirst(active, (entry) => entry.program.programId === programId),
        othersActive: Arr.some(active, (entry) => entry.program.programId !== programId),
      } satisfies ProgramDetailState
    }),
  )

/**
 * One program (built-in or the owner's), its running enrollment and the actions on it
 * (enrol, pause / resume / leave, delete). A failed action sets `error`; the next one clears it.
 */
export const useProgramDetail = (
  programId: ProgramId,
): {
  readonly state: ProgramDetailState
  readonly enroll: () => Promise<boolean>
  readonly setStatus: (
    enrollmentId: ProgramEnrollmentId,
    status: SettableStatus,
  ) => Promise<boolean>
  readonly remove: (id: UserProgramId) => Promise<boolean>
  readonly busy: boolean
  readonly error: Option.Option<string>
} => {
  const [state, setState] = useState<ProgramDetailState>({ _tag: "Loading" })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Option.Option<string>>(Option.none())
  const storeVersion = useStoreVersion()
  // Bumped when a delete fails, to re-read what the held reloads skipped.
  const [retry, setRetry] = useState(0)
  // True from the start of a delete: its own store write would reload the page to "not found"
  // before the caller has navigated away.
  const holdReloads = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    runtime.runPromiseExit(loadDetail(programId), { signal: controller.signal }).then((exit) => {
      if (controller.signal.aborted || holdReloads.current) {
        return
      }
      setState(
        Exit.match(exit, {
          onFailure: (cause): ProgramDetailState => ({
            _tag: "Failed",
            message: failureMessage(cause),
          }),
          onSuccess: (next): ProgramDetailState => next,
        }),
      )
    })
    return () => controller.abort()
  }, [programId, storeVersion, retry])

  const act = useCallback(
    (effect: Effect.Effect<unknown, unknown, ProgramRepo>, holdsReloads: boolean) => {
      setBusy(true)
      setError(Option.none())
      // biome-ignore lint/plugin/noMutation: a React ref, read by the reload effect above
      holdReloads.current = holdsReloads
      return runtime.runPromiseExit(effect).then((exit) => {
        setBusy(false)
        if (Exit.isFailure(exit)) {
          // biome-ignore lint/plugin/noMutation: a React ref, read by the reload effect above
          holdReloads.current = false
          setRetry((count) => count + 1)
          setError(Option.some(failureMessage(exit.cause)))
        }
        return Exit.isSuccess(exit)
      })
    },
    [],
  )

  return {
    state,
    enroll: () =>
      act(
        ProgramRepo.use((repo) => repo.enroll(programId)),
        false,
      ),
    setStatus: (enrollmentId, status) =>
      act(
        ProgramRepo.use((repo) => repo.setStatus(enrollmentId, status)),
        false,
      ),
    remove: (id) =>
      act(
        ProgramRepo.use((repo) => repo.deleteProgram(id)),
        true,
      ),
    busy,
    error,
  }
}

/**
 * Every program and the running enrollments from the local store; reloads after every store write
 * (`StoreEvents`), so enrolling, pausing, swapping or completing a day refreshes by itself.
 */
export const usePrograms = (): {
  readonly state: ProgramsState
  /** Pause or resume from the list; a failure turns the state into `Failed`. */
  readonly setStatus: (
    enrollmentId: ProgramEnrollmentId,
    status: SettableStatus,
  ) => Promise<boolean>
} => {
  const [state, setState] = useState<ProgramsState>({ _tag: "Loading" })
  const storeVersion = useStoreVersion()
  const refocus = useRefocusCount()

  useEffect(() => {
    const controller = new AbortController()
    runtime.runPromiseExit(load, { signal: controller.signal }).then((exit) => {
      if (controller.signal.aborted) {
        return
      }
      setState(
        Exit.match(exit, {
          onFailure: (cause): ProgramsState => ({
            _tag: "Failed",
            message: failureMessage(cause),
          }),
          onSuccess: (next) => next,
        }),
      )
    })
    return () => controller.abort()
  }, [storeVersion, refocus])

  const setStatus = useCallback((enrollmentId: ProgramEnrollmentId, status: SettableStatus) => {
    return runtime
      .runPromiseExit(ProgramRepo.use((repo) => repo.setStatus(enrollmentId, status)))
      .then((exit) => {
        if (Exit.isFailure(exit)) {
          setState({ _tag: "Failed", message: failureMessage(exit.cause) })
        }
        return Exit.isSuccess(exit)
      })
  }, [])

  return { state, setStatus }
}
