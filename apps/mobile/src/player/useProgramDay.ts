import {
  CORE30,
  findProgram,
  type Program,
  type ProgramDay,
  type ProgramEnrollment,
} from "@tanren/shared"
import { Effect, Exit, Option, Stream } from "effect"
import { useCallback, useEffect, useState } from "react"
import { ProgramRepo } from "../services/ProgramRepo"
import { failureMessage, runtime } from "../services/runtime"
import { StoreEvents } from "../services/StoreEvents"

export type ProgramDayState =
  | { readonly _tag: "Loading" }
  | { readonly _tag: "Failed"; readonly message: string }
  /** No active enrollment: the tab offers Core 30. */
  | { readonly _tag: "NotEnrolled"; readonly program: Program }
  | {
      readonly _tag: "Ready"
      readonly program: Program
      readonly enrollment: ProgramEnrollment
      /** `None` once past the last day. */
      readonly day: Option.Option<ProgramDay>
    }

const load = ProgramRepo.use((repo) =>
  repo.active.pipe(
    Effect.map(
      (active): ProgramDayState =>
        Option.match(
          Option.flatMap(active, (enrollment) =>
            Option.map(findProgram(enrollment.programId), (program) => ({ enrollment, program })),
          ),
          {
            onNone: () => ({ _tag: "NotEnrolled", program: CORE30 }),
            onSome: ({ enrollment, program }) => ({
              _tag: "Ready",
              program,
              enrollment,
              day: repo.todayFor(enrollment),
            }),
          },
        ),
    ),
  ),
)

/**
 * The active enrollment and today's day from the local store; reloads after every store write
 * (`StoreEvents`), so enrolling or completing a day refreshes the tab by itself.
 */
export const useProgramDay = (): {
  readonly state: ProgramDayState
  readonly enroll: (program: Program) => Promise<boolean>
  readonly enrolling: boolean
} => {
  const [state, setState] = useState<ProgramDayState>({ _tag: "Loading" })
  const [storeVersion, setStoreVersion] = useState(0)
  const [enrolling, setEnrolling] = useState(false)

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

  useEffect(() => {
    const controller = new AbortController()
    runtime.runPromiseExit(load, { signal: controller.signal }).then((exit) => {
      if (controller.signal.aborted) {
        return
      }
      setState(
        Exit.match(exit, {
          onFailure: (cause): ProgramDayState => ({
            _tag: "Failed",
            message: failureMessage(cause),
          }),
          onSuccess: (next) => next,
        }),
      )
    })
    return () => controller.abort()
  }, [storeVersion])

  const enroll = useCallback((program: Program) => {
    setEnrolling(true)
    return runtime
      .runPromiseExit(ProgramRepo.use((repo) => repo.enroll(program.programId)))
      .then((exit) => {
        setEnrolling(false)
        if (Exit.isFailure(exit)) {
          setState({ _tag: "Failed", message: failureMessage(exit.cause) })
        }
        return Exit.isSuccess(exit)
      })
  }, [])

  return { state, enroll, enrolling }
}
