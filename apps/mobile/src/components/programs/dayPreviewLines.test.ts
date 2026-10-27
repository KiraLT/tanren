import { describe, expect, it } from "@effect/vitest"
import { CatalogId, CORE30, LEAN_BUILD_12, type ProgramDay, Reps } from "@tanren/shared"
import { Array as Arr, Option } from "effect"
import {
  dayParam,
  itemLine,
  type PreviewEnrollment,
  positionLabel,
  previewDay,
  startable,
} from "./dayPreviewLines"

const enrolled = (overrides: Partial<PreviewEnrollment> = {}): Option.Option<PreviewEnrollment> =>
  Option.some({ status: "active", currentDay: 3, swaps: [], ...overrides })

const day = (title: string, dayNumber = 5): ProgramDay => ({
  dayNumber,
  title,
  rounds: 1,
  restBetweenRoundsSeconds: 0,
  items: [
    { kind: "reps", catalogId: CatalogId.make("push-up"), reps: Reps.make(12), restSeconds: 30 },
  ],
})

describe("positionLabel", () => {
  it("replaces the leading 'Day N' part with 'Day N of total'", () => {
    expect(positionLabel(day("Day 5 · Week 1 · Push"), 84)).toBe("Day 5 of 84 · Week 1 · Push")
    expect(positionLabel(day("Day 12 · Build", 12), 30)).toBe("Day 12 of 30 · Build")
  })

  it("keeps every part of a title without a 'Day N' prefix", () => {
    expect(positionLabel(day("Upper body"), 10)).toBe("Day 5 of 10 · Upper body")
    expect(positionLabel(day("Day 5"), 10)).toBe("Day 5 of 10")
  })

  it("reads a real Lean Build day", () => {
    const fifth = Option.getOrThrow(previewDay(LEAN_BUILD_12, 5, Option.none()))
    expect(positionLabel(fifth, LEAN_BUILD_12.days.length)).toMatch(/^Day 5 of 84 · /)
  })
})

describe("itemLine", () => {
  it("reps and timed items with rest", () => {
    expect(
      itemLine({
        kind: "reps",
        catalogId: CatalogId.make("push-up"),
        reps: Reps.make(12),
        restSeconds: 30,
      }),
    ).toBe("12 reps · 30 s rest")
    expect(
      itemLine({ kind: "timed", catalogId: CatalogId.make("plank"), seconds: 40, restSeconds: 15 }),
    ).toBe("40 s · 15 s rest")
  })

  it("drops the rest part when there is none", () => {
    expect(
      itemLine({ kind: "timed", catalogId: CatalogId.make("plank"), seconds: 40, restSeconds: 0 }),
    ).toBe("40 s")
  })
})

describe("startable", () => {
  it("is true only for the current day of an active enrollment", () => {
    expect(startable(enrolled(), 3)).toBe(true)
  })

  it("is false for a paused enrollment, another day or no enrollment", () => {
    expect(startable(enrolled({ status: "paused" }), 3)).toBe(false)
    expect(startable(enrolled(), 4)).toBe(false)
    expect(startable(Option.none(), 3)).toBe(false)
  })
})

describe("dayParam", () => {
  it("accepts integers 1–365 only", () => {
    expect(dayParam("5")).toEqual(Option.some(5))
    expect(dayParam("0")).toEqual(Option.none())
    expect(dayParam("366")).toEqual(Option.none())
    expect(dayParam("2.5")).toEqual(Option.none())
    expect(dayParam(["5"])).toEqual(Option.none())
    expect(dayParam(undefined)).toEqual(Option.none())
  })
})

describe("previewDay", () => {
  it("finds the day and is None past the end", () => {
    expect(Option.map(previewDay(CORE30, 1, Option.none()), (d) => d.dayNumber)).toEqual(
      Option.some(1),
    )
    expect(previewDay(CORE30, CORE30.days.length + 1, Option.none())).toEqual(Option.none())
  })

  it("applies the running enrollment's swaps", () => {
    const first = Option.getOrThrow(previewDay(CORE30, 1, Option.none()))
    const from = Option.getOrThrow(Arr.head(first.items)).catalogId
    const to = CatalogId.make("incline-push-up")
    const swapped = Option.getOrThrow(previewDay(CORE30, 1, enrolled({ swaps: [{ from, to }] })))
    expect(Option.getOrThrow(Arr.head(swapped.items)).catalogId).toBe(to)
  })
})
