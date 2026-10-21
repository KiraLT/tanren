import { describe, expect, it } from "@effect/vitest"
import { CORE30 } from "@tanren/shared"
import { Array as Arr, Option } from "effect"
import {
  dayCardLine,
  dayDisc,
  dayMinutes,
  daysDone,
  dayTrailing,
  doneLabel,
  programProgress,
} from "./programDays"

const firstDay = Option.getOrThrow(Arr.head(CORE30.days))

describe("dayDisc", () => {
  it("is done before the current day, now on it and todo after, numbered by day", () => {
    expect(dayDisc(1, 2)).toEqual({ state: "done", index: 1 })
    expect(dayDisc(2, 2)).toEqual({ state: "now", index: 2 })
    expect(dayDisc(3, 2)).toEqual({ state: "todo", index: 3 })
  })
})

describe("progress", () => {
  it("counts finished days and clamps past the last day", () => {
    expect(daysDone(1, 30)).toBe(0)
    expect(daysDone(2, 30)).toBe(1)
    expect(daysDone(31, 30)).toBe(30)
    expect(daysDone(99, 30)).toBe(30)
    expect(daysDone(0, 30)).toBe(0)
  })

  it("is a 0..1 fraction for the ring, 0 for an empty program", () => {
    expect(programProgress(1, 30)).toBe(0)
    expect(programProgress(16, 30)).toBe(0.5)
    expect(programProgress(31, 30)).toBe(1)
    expect(programProgress(3, 0)).toBe(0)
  })

  it("words the counter above the day list", () => {
    expect(doneLabel(2, 30)).toBe("1 of 30 done")
  })
})

describe("day text", () => {
  it("rounds the planned length to whole minutes", () => {
    expect(dayMinutes(firstDay)).toBeGreaterThan(0)
    expect(dayTrailing(firstDay)).toBe(`${dayMinutes(firstDay)} min`)
  })

  it("writes the card line with day, total, exercise count and minutes", () => {
    expect(dayCardLine(firstDay, CORE30.days.length)).toBe(
      `Day ${firstDay.dayNumber} of ${CORE30.days.length} · ${firstDay.items.length} exercises · ${dayMinutes(firstDay)} min`,
    )
  })

  it("uses the singular for one exercise", () => {
    const [only] = Arr.take(firstDay.items, 1)
    expect(only).toBeDefined()
    expect(dayCardLine({ ...firstDay, items: [...Arr.take(firstDay.items, 1)] }, 30)).toContain(
      "1 exercise ·",
    )
  })
})
