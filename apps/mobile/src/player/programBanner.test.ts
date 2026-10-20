import { describe, expect, it } from "@effect/vitest"
import {
  CORE30,
  LocalDate,
  type ProgramDay,
  ProgramEnrollment,
  ProgramEnrollmentId,
} from "@tanren/shared"
import { Array as Arr, DateTime, Option } from "effect"
import { LOCAL_USER_ID } from "../store/localUser"
import { programBannerOf } from "./programBanner"

const at = DateTime.makeUnsafe("2026-10-21T08:00:00.000Z")
const enrollment = new ProgramEnrollment({
  id: ProgramEnrollmentId.make("00000000-0000-4000-8000-0000000000b1"),
  userId: LOCAL_USER_ID,
  createdAt: at,
  updatedAt: at,
  deletedAt: Option.none(),
  programId: CORE30.programId,
  startedOn: LocalDate.make("2026-10-10"),
  status: "active",
  currentDay: 12,
})
const ready = (day: Option.Option<ProgramDay>) =>
  ({ _tag: "Ready", program: CORE30, enrollment, day }) as const

describe("programBannerOf", () => {
  it("names the program and day, with the day title and an open label", () => {
    const day12 = Arr.findFirst(CORE30.days, (day) => day.dayNumber === 12)
    expect(programBannerOf(ready(day12))).toEqual(
      Option.map(day12, (day) => ({
        title: "Core 30 · Day 12",
        subtitle: day.title,
        accessibilityLabel: "Open Core 30 day 12",
      })),
    )
    expect(Option.isSome(day12)).toBe(true)
  })

  it("is None when not enrolled, loading, or past the last day", () => {
    expect(programBannerOf({ _tag: "NotEnrolled", program: CORE30 })).toEqual(Option.none())
    expect(programBannerOf({ _tag: "Loading" })).toEqual(Option.none())
    expect(programBannerOf(ready(Option.none()))).toEqual(Option.none())
  })
})
