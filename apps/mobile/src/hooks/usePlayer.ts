import type { CatalogId, DayNumber, ProgramDay, ProgramEnrollmentId } from "@tanren/shared"
import { Array as Arr, Exit, Match, Option } from "effect"
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
  prefillFor,
  type RunConfig,
  reduceRun,
} from "../player/cues"
import { initialPlan, reconcilePlan } from "../player/mergeDay"
import {
  COMPLETION_FAILED,
  type CompletionResult,
  cancelAlerts,
  completeDay,
  type FinishedRun,
  loadPrefill,
  syncAlerts,
} from "../player/playerEffects"
import { type PlayerEventTag, phaseKey, playerEvent, remainingMs } from "../player/playerMachine"
import type { SetEntry } from "../services/ProgramRepo"
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
  /** The weight / reps steppers: replaces `run.draft` for the item being worked. */
  readonly adjust: (entry: SetEntry) => void
  readonly completion: CompletionState
  /** After a failed save: try `completeDay` again with the same input. */
  readonly retry: () => void
} => {
  // Each loaded exercise's last logged load, read once per `session.day` (a swap reloads it).
  const [prefill, setPrefill] = useState<ReadonlyMap<CatalogId, SetEntry>>(() => new Map())
  useEffect(
    () =>
      runtime.runCallback(loadPrefill(Arr.map(session.day.items, (item) => item.catalogId)), {
        onExit: (exit) => {
          if (Exit.isSuccess(exit)) {
            setPrefill(exit.value)
          }
        },
      }),
    [session.day],
  )
  // The exercise of every item-round. A swap reaches the player as a new `session.day` (the
  // route's `mergeDay`); it renames the item-rounds still open and never the ones already done,
  // so `complete` logs what was performed, and the weights follow the same ids (`RunConfig.ids`).
  const [plan, setPlan] = useState({ day: session.day, ids: initialPlan(session.day) })
  const config: RunConfig = useMemo(
    () => ({ day: session.day, speed: SPEED, prefill, ids: plan.ids }),
    [session.day, prefill, plan.ids],
  )
  const reducer = useMemo(() => reduceRun(config), [config])
  const [run, dispatch] = useReducer(reducer, undefined, () => initialRun(Date.now()))
  // `start` usually runs before the read lands: an untouched draft of the item being worked
  // moves to the loaded value (a stepper the user already changed is kept).
  const [prefillSeen, setPrefillSeen] = useState(prefill)
  if (prefillSeen !== prefill) {
    setPrefillSeen(prefill)
    const index = run.entries.length
    const before = prefillFor({ ...config, prefill: prefillSeen }, run.entries, index)
    const after = prefillFor(config, run.entries, index)
    if (
      Option.isSome(run.draft) &&
      Option.isSome(before) &&
      Option.isSome(after) &&
      run.draft.value.weightKg === before.value.weightKg &&
      run.draft.value.reps === before.value.reps
    ) {
      dispatch({ _tag: "adjust", ...after.value })
    }
  }
  const adjust = useCallback(
    (entry: SetEntry) => dispatch({ _tag: "adjust", weightKg: entry.weightKg, reps: entry.reps }),
    [],
  )
  // A swap of the round being worked restarts its draft from the replacement (`replan`).
  const [idsSeen, setIdsSeen] = useState(plan.ids)
  if (idsSeen !== plan.ids) {
    setIdsSeen(plan.ids)
    dispatch({ _tag: "replan", previousIds: idsSeen })
  }
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
          entries: run.entries,
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
    adjust,
    completion,
    retry,
  }
}
