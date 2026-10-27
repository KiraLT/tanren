export interface TodayEmptyCopy {
  readonly title: string
  readonly body: string
}

/**
 * The Today empty state ("no gym session planned") sits below the "Programs due" rows, so while a
 * program day is due it must not claim there is nothing to do (owner, 2026-10-27).
 */
export const todayEmptyCopy = (programsDue: number): TodayEmptyCopy =>
  programsDue > 0
    ? { title: "No gym session planned", body: "Your program day is ready above." }
    : { title: "Nothing planned today", body: "Rest up. Your next session shows up here." }
