import type { Activity } from "@tanren/shared"
import { Array as Arr, DateTime, Match } from "effect"
import { useRouter } from "expo-router"
import { useCallback } from "react"
import { inLocalZone } from "../components/feed/feedGroups"
import { localDateOf } from "../components/planFormat"
import { useDueToday } from "../components/TodayPrograms"
import { finishedOn, type StartTarget, startLabel, startTarget } from "../components/today/upNext"
import type { ActiveProgram } from "../services/ProgramRepo"
import { useFeed } from "./useFeed"
import { type TodayState, useFreeWorkoutActions, useToday } from "./useToday"

export interface StartWorkout {
  readonly target: StartTarget
  readonly label: string
  /** True while Today is loading or failed: there is nothing to start yet. */
  readonly disabled: boolean
  /** Resolves false only when starting a free workout failed (the caller shows a Banner). */
  readonly start: () => Promise<boolean>
}

/** Home's pager: `/home?workout=1` shows today's session one exercise per page. */
export const WORKOUT_HREF = { pathname: "/home", params: { workout: "1" } } as const

/** Newest feed items read for "Done today": more workouts than anyone finishes in one day. */
const DONE_LOOKBACK = 10

/** Today's finished workouts (local day), newest first, from the feed (navigation-v2.md §6). */
export const useDoneToday = (): ReadonlyArray<Activity> => {
  const { state } = useFeed(DONE_LOOKBACK)
  if (state._tag !== "Ready") {
    return []
  }
  const sessions = Arr.flatMap(state.value, (item) =>
    item._tag === "session"
      ? [
          {
            ...item.activity,
            date: DateTime.formatIsoDate(inLocalZone(item.activity.startedAt)),
          },
        ]
      : [],
  )
  return finishedOn(sessions, localDateOf(new Date()))
}

type Router = ReturnType<typeof useRouter>

const run = (
  target: StartTarget,
  router: Router,
  startFree: () => Promise<boolean>,
): Promise<boolean> =>
  Match.value(target).pipe(
    Match.tagsExhaustive({
      None: () => Promise.resolve(true),
      Session: () => {
        router.navigate(WORKOUT_HREF)
        return Promise.resolve(true)
      },
      AddExercise: () => {
        router.navigate("/train?view=library")
        return Promise.resolve(true)
      },
      Program: ({ enrollmentId }) => {
        // biome-ignore lint/plugin/noMutation: Expo Router's navigation call, not an array push
        router.push({ pathname: "/programs/play", params: { enrollmentId } })
        return Promise.resolve(true)
      },
      Free: () =>
        startFree().then((ok) => {
          if (ok) {
            router.navigate("/train?view=library")
          }
          return ok
        }),
      Done: ({ next }) => run(next, router, startFree),
    }),
  )

/**
 * The shared Start (navigation-v2.md §2 Merge, §6, ADR-0028/0029) for a Today state the caller
 * already reads: planned session → the pager; due program day → `programs/play`; else a free
 * workout, then the Library to add its first exercise. After a finished workout a fresh start is
 * "Start another" (`Done`).
 */
export const useStartAction = (
  state: TodayState,
  due: ReadonlyArray<ActiveProgram>,
  doneToday: number,
): StartWorkout => {
  const router = useRouter()
  const { start: startFree } = useFreeWorkoutActions()
  const target = startTarget(state, due, doneToday)
  const start = useCallback(() => run(target, router, startFree), [target, router, startFree])
  return { target, label: startLabel(target), disabled: target._tag === "None", start }
}

/** The shared Start for screens that do not read Today themselves (Train, the desktop AppBar). */
export const useStartWorkout = (): StartWorkout =>
  useStartAction(useToday().state, useDueToday(), useDoneToday().length)
