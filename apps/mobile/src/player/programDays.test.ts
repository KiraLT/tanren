import { describe, expect, it } from "@effect/vitest"
import { CORE30 } from "@tanren/shared"
import { Array as Arr, Option } from "effect"
import {
  dayCardLine,
  dayDisc,
  dayMinutes,
  dayStateLabel,
  daysDone,
  dayTrailing,
  doneLabel,
  insideRows,
  programProgress,
  WEEK_LENGTH,
  weekWindow,
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

describe("weekWindow", () => {
  const days = Arr.makeBy(30, (index) => ({ dayNumber: index + 1 }))
  const numbers = (current: number, source: ReadonlyArray<{ readonly dayNumber: number }> = days) =>
    weekWindow(source, current).map((day) => day.dayNumber)

  it("shows 3 days before and 3 after the current day", () => {
    expect(numbers(10)).toEqual([7, 8, 9, 10, 11, 12, 13])
  })

  it("slides inside the program at the start and the end", () => {
    expect(numbers(1)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(numbers(2)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(numbers(30)).toEqual([24, 25, 26, 27, 28, 29, 30])
  })

  it("shows the last week for an enrollment past the last day", () => {
    expect(numbers(31)).toEqual([24, 25, 26, 27, 28, 29, 30])
  })

  it("keeps every day of a program shorter than a week", () => {
    expect(numbers(2, Arr.take(days, 4))).toEqual([1, 2, 3, 4])
    expect(weekWindow([], 1)).toEqual([])
  })

  it("is exactly WEEK_LENGTH days for Core 30", () => {
    expect(weekWindow(CORE30.days, 15)).toHaveLength(WEEK_LENGTH)
  })
})

describe("dayStateLabel", () => {
  it("words each disc state for screen readers", () => {
    expect(dayStateLabel("done")).toBe("done")
    expect(dayStateLabel("now")).toBe("up next")
    expect(dayStateLabel("todo")).toBe("upcoming")
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

describe("insideRows", () => {
  it("lists the first week of days with their minutes", () => {
    const rows = insideRows(CORE30.days)
    expect(rows).toHaveLength(WEEK_LENGTH)
    expect(rows.map((row) => row.dayNumber)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(rows[0]).toEqual({
      dayNumber: 1,
      title: firstDay.title,
      trailing: dayTrailing(firstDay),
    })
    expect(rows.every((row) => /^\d+ min$/.test(row.trailing))).toBe(true)
  })

  it("lists what exists for a program shorter than a week", () => {
    expect(insideRows(Arr.take(CORE30.days, 3)).map((row) => row.dayNumber)).toEqual([1, 2, 3])
  })

  it("is empty for a program without days", () => {
    expect(insideRows([])).toEqual([])
  })
})
