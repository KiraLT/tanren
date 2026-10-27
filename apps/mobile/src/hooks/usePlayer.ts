import type { DayNumber, ProgramDay, ProgramEnrollmentId } from "@tanren/shared"
import { Array as Arr, Match, Option } from "effect"
import { useAudioPlayer } from "expo-audio"
import * as Haptics from "expo-haptics"
import { useCallback, useEffect, useMemo, useReducer, useState } from "react"
import { AppState, Platform } from "react-native"
import {
  alertFor,
  countdownCue,
  cueFor,
  initialRun,
  isRunning,
  type PlayerRun,
  parseSpeed,
  reduceRun,
} from "../player/cues"
import { initialPlan, reconcilePlan } from "../player/mergeDay"
import {
  COMPLETION_FAILED,
  type CompletionResult,
  cancelAlerts,
  completeDay,
  type FinishedRun,
  syncAlerts,
} from "../player/playerEffects"
import { type PlayerEventTag, phaseKey, playerEvent, remainingMs } from "../player/playerMachine"
import { runtime } from "../services/runtime"

/** Bundled ≤ 20 KB sine beep; Metro resolves the asset to a module id. */
const BEEP: number = require("../../assets/sounds/beep.wav")

/** Dev speed-up (v2-programs.md §4), inlined by Expo at bundle time; static access only. */
const SPEED = parseSpeed(process.env.EXPO_PUBLIC_PLAYER_SPEED)

const TICK_MS = 250

export interface PlayerSession {
  readonly enrollmentId: ProgramEnrollmentId
  readonly dayNumber: DayNumber
  readonly day: ProgramDay
}

export type CompletionState =
  | { readonly _tag: "None" }
  | { readonly _tag: "Saving"; readonly durationSeconds: number }
  | CompletionResult

const isWeb = Platform.OS === "web"

/** Haptics are fire-and-forget; web has no Taptic engine, so they are skipped there. */
const haptic = (run: () => Promise<void>): void => {
  if (!isWeb) {
    run().catch(() => undefined)
  }
}

/**
 * The workout player: `step` in a reducer, a 250 ms tick while running in the foreground plus a
 * tick on `AppState` → active (deadlines catch up), cues on every phase change, the phase-end
 * alert (re)scheduled through `PhaseAlerts`, and on `Done` the day completed and synced.
 */
export const usePlayer = (
  session: PlayerSession,
): {
  readonly run: PlayerRun
  readonly speed: number
  readonly remainingMs: Option.Option<number>
  readonly send: (tag: PlayerEventTag) => void
  readonly completion: CompletionState
  /** After a failed save: try `completeDay` again with the same input. */
  readonly retry: () => void
} => {
  const config = useMemo(() => ({ day: session.day, speed: SPEED }), [session.day])
  const reducer = useMemo(() => reduceRun(config), [config])
  const [run, dispatch] = useReducer(reducer, undefined, () => initialRun(Date.now()))
  // The exercise of every item-round. A swap reaches the player as a new `session.day` (the
  // route's `mergeDay`); it renames the item-rounds still open and never the ones already done,
  // so `complete` logs what was performed.
  const [plan, setPlan] = useState({ day: session.day, ids: initialPlan(session.day) })
  useEffect(() => {
    setPlan((prev) =>
      prev.day === session.day
        ? prev
        : {
            day: session.day,
            ids: reconcilePlan(prev.ids, prev.day, session.day, run.player),
          },
    )
  }, [session.day])
  const [completion, setCompletion] = useState<CompletionState>({ _tag: "None" })
  const [foreground, setForeground] = useState(AppState.currentState === "active")
  const beep = useAudioPlayer(BEEP)

  const send = useCallback((tag: PlayerEventTag) => dispatch(playerEvent(tag, Date.now())), [])

  // Foreground tracking: a tick on return catches up with deadlines missed in the background.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (status) => {
      setForeground(status === "active")
      if (status === "active") {
        dispatch(playerEvent("tick", Date.now()))
      }
    })
    return () => subscription.remove()
  }, [])

  const running = isRunning(run.player)
  useEffect(() => {
    if (!running || !foreground) {
      return
    }
    const timer = setInterval(() => dispatch(playerEvent("tick", Date.now())), TICK_MS)
    return () => clearInterval(timer)
  }, [running, foreground])

  const playBeep = useCallback(() => {
    if (foreground) {
      beep
        .seekTo(0)
        .then(() => beep.play())
        .catch(() => undefined)
    }
  }, [beep, foreground])

  // Phase change: cue, then cancel + reschedule the phase-end alert.
  const key = phaseKey(run.player)
  // Keyed on the phase key only; the run read here is the one that produced it.
  useEffect(() => {
    Match.value(cueFor(run.previous, run.player)).pipe(
      Match.when("rest", () => {
        haptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success))
        playBeep()
      }),
      Match.when("done", () => {
        haptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success))
        playBeep()
      }),
      Match.when("work", playBeep),
      Match.when("none", () => undefined),
      Match.exhaustive,
    )
    if (run.player._tag !== "Idle") {
      runtime.runPromise(syncAlerts(alertFor(config, run.player))).catch(() => undefined)
    }
  }, [key])

  // 3-2-1 before the next work phase starts.
  useEffect(() => {
    if (Option.isSome(countdownCue(run))) {
      haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy))
    }
  }, [run.nowMs])

  // Leaving the screen drops any pending alert.
  useEffect(
    () => () => {
      runtime.runPromise(cancelAlerts).catch(() => undefined)
    },
    [],
  )

  // Done (by finish or by the last deadline): complete the day once, then show the sheet.
  const finished: Option.Option<FinishedRun> =
    run.player._tag === "Done"
      ? Option.some({
          enrollmentId: session.enrollmentId,
          dayNumber: session.dayNumber,
          startedAtMs: Option.getOrElse(run.startedAtMs, () => run.nowMs),
          durationSeconds: run.player.durationSeconds,
          performedItems: run.performedItems,
          performedIds: Arr.take(plan.ids, run.performedItems),
        })
      : Option.none()

  const save = useCallback((input: FinishedRun) => {
    setCompletion({ _tag: "Saving", durationSeconds: input.durationSeconds })
    runtime
      .runPromise(completeDay(input))
      .then(setCompletion)
      .catch(() =>
        setCompletion({
          _tag: "Failed",
          durationSeconds: input.durationSeconds,
          message: COMPLETION_FAILED,
        }),
      )
  }, [])

  const isDone = Option.isSome(finished)
  useEffect(() => {
    if (Option.isSome(finished) && completion._tag === "None") {
      save(finished.value)
    }
  }, [isDone])

  /** Re-runs `completeDay` with the same input; a repeat for the day is idempotent. */
  const retry = useCallback(() => Option.map(finished, save), [finished, save])

  return {
    run,
    speed: SPEED,
    remainingMs: remainingMs(run.player, run.nowMs),
    send,
    completion,
    retry,
  }
}
