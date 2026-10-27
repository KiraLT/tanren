import { type ProgramSummary, UserProgramId } from "@tanren/shared"
import { Option, Schema } from "effect"
import type { Tone } from "../ui"

/** "30 days · 15–20 min", plus " · Made with Claude" for a program written over MCP. */
export const summarySubtitle = (summary: ProgramSummary): string => {
  const { min, max } = summary.minutesPerDay
  const minutes = min === max ? `${min} min` : `${min}–${max} min`
  const days = `${summary.days} ${summary.days === 1 ? "day" : "days"}`
  return summary.source === "mcp"
    ? `${days} · ${minutes} · Made with Claude`
    : `${days} · ${minutes}`
}

export interface RowBadge {
  readonly label: string
  readonly tone: Tone
}

/**
 * The one trailing slot of a program row (<= 100 px): a running enrollment's status wins over the
 * "Yours" badge of a program the owner (or Claude) wrote; built-ins without a run show nothing.
 */
export const summaryBadge = (summary: ProgramSummary): Option.Option<RowBadge> => {
  const running = Option.filter(
    summary.enrollment,
    ({ status }) => status === "active" || status === "paused",
  )
  return Option.match(running, {
    onSome: ({ status }): Option.Option<RowBadge> =>
      Option.some(
        status === "paused"
          ? { label: "Paused", tone: "neutral" }
          : { label: "Active", tone: "accent" },
      ),
    onNone: () =>
      summary.source === "builtin"
        ? Option.none()
        : Option.some({ label: "Yours", tone: "neutral" }),
  })
}

/** The accessible name of a program row: title, subtitle and the badge. */
export const summaryLabel = (summary: ProgramSummary): string =>
  Option.match(summaryBadge(summary), {
    onNone: () => `${summary.title}, ${summarySubtitle(summary)}`,
    onSome: ({ label }) => `${summary.title}, ${summarySubtitle(summary)}, ${label}`,
  })

/** A custom program's `programId` is its row UUID (lower-cased); a built-in slug has no row. */
export const userProgramIdOf = (summary: ProgramSummary): Option.Option<UserProgramId> =>
  summary.source === "builtin"
    ? Option.none()
    : Schema.decodeUnknownOption(UserProgramId)(summary.programId)

/** The enrol button: "Start alongside" when another program already runs. */
export const enrolLabel = (othersActive: boolean): string =>
  othersActive ? "Start alongside" : "Start program"

/** Subtitle of the disabled "Delete program" row while an enrollment runs. */
export const DELETE_BLOCKED = "Leave the program first"
