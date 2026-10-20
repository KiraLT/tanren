import { Option } from "effect"
import type { ProgramDayState } from "./useProgramDay"

export interface ProgramBanner {
  /** "Core 30 · Day 12". */
  readonly title: string
  /** The day's own title, e.g. "Day 12 · Build". */
  readonly subtitle: string
  /** "Open Core 30 day 12". */
  readonly accessibilityLabel: string
}

/** Today's program block: only for an active enrollment that still has a day to do. */
export const programBannerOf = (state: ProgramDayState): Option.Option<ProgramBanner> =>
  state._tag === "Ready"
    ? Option.map(state.day, (day) => ({
        title: `${state.program.name} · Day ${day.dayNumber}`,
        subtitle: day.title,
        accessibilityLabel: `Open ${state.program.name} day ${day.dayNumber}`,
      }))
    : Option.none()
