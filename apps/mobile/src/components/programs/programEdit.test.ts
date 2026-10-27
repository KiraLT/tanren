import { describe, expect, it } from "@effect/vitest"
import { CatalogId, CORE30, LEAN_BUILD_12, type ProgramDay, ProgramId, Slug } from "@tanren/shared"
import { Array as Arr, Option, Schema } from "effect"
import {
  addDay,
  appendItem,
  BLANK_ITEM,
  daySubtitle,
  defaultSchedule,
  itemFromCatalog,
  MAX_DAYS,
  MAX_ITEMS,
  moveDay,
  moveItem,
  parsePickFor,
  pickForParam,
  RANGES,
  removeDay,
  removeItem,
  renumber,
  slugify,
  slugWithSuffix,
  stepValue,
  toggleWeekday,
  updateDay,
  withKind,
  withWorkValue,
  workText,
} from "./programEdit"

const isSlug = (text: string) => Option.isSome(Schema.decodeUnknownOption(Slug)(text))

const days = CORE30.days

describe("slugify", () => {
  it("lower-cases and joins words with one hyphen", () => {
    expect(slugify("Push  Pull   Legs")).toBe("push-pull-legs")
  })

  it("folds accents", () => {
    expect(slugify("Évening Crème brûlée")).toBe("evening-creme-brulee")
  })

  it("drops symbols and edge hyphens", () => {
    expect(slugify("  --My 5x5 (heavy!) -- ")).toBe("my-5x5-heavy")
  })

  it("falls back for text with no letters or digits", () => {
    expect(slugify("鍛錬 !!!")).toBe("program")
    expect(isSlug(slugify(""))).toBe(true)
  })

  it("is at most 64 characters, never ends in a hyphen and satisfies Slug", () => {
    const long = `${"abcd ".repeat(30)}tail`
    const slug = slugify(long)
    expect(slug.length).toBeLessThanOrEqual(64)
    expect(slug.endsWith("-")).toBe(false)
    expect(isSlug(slug)).toBe(true)
  })

  it("leaves room for the suffix", () => {
    const slug = slugWithSuffix("x".repeat(200), "ab12")
    expect(slug.length).toBeLessThanOrEqual(64)
    expect(slug.endsWith("-ab12")).toBe(true)
    expect(isSlug(slug)).toBe(true)
  })
})

describe("moveItem", () => {
  it("swaps with the neighbour", () => {
    expect(moveItem(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"])
    expect(moveItem(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"])
  })

  it("is a no-op up at the start and down at the end", () => {
    const items = ["a", "b", "c"]
    expect(moveItem(items, 0, -1)).toBe(items)
    expect(moveItem(items, 2, 1)).toBe(items)
  })

  it("is a no-op for an index outside the array", () => {
    const items = ["a"]
    expect(moveItem(items, 5, -1)).toBe(items)
  })
})

describe("stepValue", () => {
  it("steps and clamps into the range", () => {
    expect(stepValue(30, 1, RANGES.seconds)).toBe(35)
    expect(stepValue(10, -1, RANGES.seconds)).toBe(10)
    expect(stepValue(600, 1, RANGES.seconds)).toBe(600)
    expect(stepValue(0, -1, RANGES.restBetweenRounds)).toBe(0)
    expect(stepValue(295, 1, RANGES.rest)).toBe(300)
  })
})

describe("days", () => {
  it("renumber follows the order and a leading 'Day N' in the title", () => {
    const [first, second] = days
    expect(first).toBeDefined()
    expect(second).toBeDefined()
    if (first === undefined || second === undefined) {
      return
    }
    const moved = renumber([
      { ...second, title: "Day 2 · Build" },
      { ...first, title: "Warm-up" },
    ])
    expect(Arr.map(moved, (day) => day.dayNumber)).toEqual([1, 2])
    expect(Arr.map(moved, (day) => day.title)).toEqual(["Day 1 · Build", "Warm-up"])
  })

  it("moveDay swaps two days and renumbers", () => {
    const moved = moveDay(days, 0, 1)
    expect(Arr.map(Arr.take(moved, 2), (day) => day.dayNumber)).toEqual([1, 2])
    expect(moved[0]?.items).toEqual(days[1]?.items)
    expect(moveDay(days, 0, -1)).toEqual(renumber(days))
  })

  it("addDay duplicates the last day at the end and stops at the cap", () => {
    const three = Arr.take(days, 3)
    const added = addDay(three)
    expect(added).toHaveLength(4)
    expect(added[3]?.dayNumber).toBe(4)
    expect(added[3]?.items).toEqual(three[2]?.items)
    const full = Arr.take(LEAN_BUILD_12.days, MAX_DAYS)
    expect(addDay(full)).toBe(full)
  })

  it("removeDay renumbers and keeps the only day", () => {
    const two = Arr.take(days, 2)
    const left = removeDay(two, 0)
    expect(left).toHaveLength(1)
    expect(left[0]?.dayNumber).toBe(1)
    expect(removeDay(left, 0)).toBe(left)
  })

  it("updateDay touches only the named day", () => {
    const two = Arr.take(days, 2)
    const changed = updateDay(two, 2, (day) => ({ ...day, rounds: 4 }))
    expect(changed[0]).toEqual(two[0])
    expect(changed[1]?.rounds).toBe(4)
  })

  it("daySubtitle counts items and rounds the minutes", () => {
    const day = days[0]
    expect(day).toBeDefined()
    if (day !== undefined) {
      expect(daySubtitle(day)).toMatch(/^\d+ items? · ≈ \d+ min$/)
    }
  })
})

describe("items", () => {
  const day: ProgramDay = {
    dayNumber: 1,
    title: "Day 1",
    rounds: 1,
    items: [BLANK_ITEM],
    restBetweenRoundsSeconds: 60,
  }

  it("itemFromCatalog: reps 10 or timed 30 s, rest 30", () => {
    expect(itemFromCatalog({ catalogId: CatalogId.make("squat"), kind: "reps" })).toMatchObject({
      kind: "reps",
      reps: 10,
      restSeconds: 30,
    })
    expect(itemFromCatalog({ catalogId: CatalogId.make("plank"), kind: "timed" })).toMatchObject({
      kind: "timed",
      seconds: 30,
      restSeconds: 30,
    })
  })

  it("withKind switches mode and keeps exercise and rest", () => {
    const reps = withKind(BLANK_ITEM, "reps")
    expect(reps).toMatchObject({ kind: "reps", reps: 10, catalogId: "plank", restSeconds: 30 })
    expect(withKind(reps, "timed")).toMatchObject({ kind: "timed", seconds: 30 })
    expect(withKind(reps, "reps")).toBe(reps)
  })

  it("withWorkValue and workText follow the kind", () => {
    expect(workText(withWorkValue(BLANK_ITEM, 45))).toBe("45 s")
    expect(workText(withWorkValue(withKind(BLANK_ITEM, "reps"), 1))).toBe("1 rep")
    expect(workText(withWorkValue(withKind(BLANK_ITEM, "reps"), 12))).toBe("12 reps")
  })

  it("removeItem keeps the only item; appendItem stops at the cap", () => {
    expect(removeItem(day, 0)).toBe(day)
    const full = Arr.reduce(Arr.range(1, MAX_ITEMS), day, (acc) => appendItem(acc, BLANK_ITEM))
    expect(full.items).toHaveLength(MAX_ITEMS)
    expect(appendItem(full, BLANK_ITEM)).toBe(full)
    expect(removeItem(full, 0).items).toHaveLength(MAX_ITEMS - 1)
  })
})

describe("schedule", () => {
  it("defaultSchedule is the day count, at most 6 a week", () => {
    expect(defaultSchedule(30)).toEqual({ kind: "daysPerWeek", days: 6 })
    expect(defaultSchedule(3)).toEqual({ kind: "daysPerWeek", days: 3 })
    expect(defaultSchedule(0)).toEqual({ kind: "daysPerWeek", days: 1 })
  })

  it("toggleWeekday starts a weekdays schedule, keeps week order, and keeps the last day", () => {
    const wed = toggleWeekday({ kind: "daysPerWeek", days: 3 }, "wed")
    expect(wed).toEqual({ kind: "weekdays", weekdays: ["wed"] })
    const monWed = toggleWeekday(wed, "mon")
    expect(monWed).toEqual({ kind: "weekdays", weekdays: ["mon", "wed"] })
    expect(toggleWeekday(monWed, "mon")).toEqual(wed)
    expect(toggleWeekday(wed, "wed")).toBe(wed)
  })
})

describe("pickFor param", () => {
  const id = "0b5e5c4e-6f0a-4d7b-9f2a-1c2d3e4f5a6b"

  it("round-trips <programId>/<dayNumber>", () => {
    const parsed = parsePickFor(pickForParam({ programId: ProgramId.make(id), dayNumber: 3 }))
    expect(Option.getOrUndefined(parsed)).toEqual({ programId: id, dayNumber: 3 })
  })

  it("rejects a missing param, a missing day, a bad day and extra parts", () => {
    const bad = [undefined, "", id, `${id}/`, `${id}/0`, `${id}/x`, `${id}/1/2`, "/3"]
    expect(Arr.map(bad, (text) => Option.isNone(parsePickFor(text)))).toEqual(
      Arr.map(bad, () => true),
    )
  })
})
