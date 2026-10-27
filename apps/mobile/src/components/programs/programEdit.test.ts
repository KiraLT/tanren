import { describe, expect, it } from "@effect/vitest"
import { CatalogId, CORE30, LEAN_BUILD_12, type ProgramDay, ProgramId, Slug } from "@tanren/shared"
import { Array as Arr, Option, Schema } from "effect"
import {
  addDay,
  appendItem,
  BLANK_ITEM,
  daySubtitle,
  defaultSchedule,
  enterRest,
  enterRestBetweenRounds,
  enterRounds,
  enterSets,
  enterWork,
  fitTyped,
  itemFromCatalog,
  MAX_DAYS,
  MAX_ITEMS,
  mapItem,
  moveDay,
  moveItem,
  parsePickFor,
  pickForParam,
  removeDay,
  removeItem,
  scheduleCaption,
  setsText,
  slugWithSuffix,
  stepRest,
  stepRestBetweenRounds,
  stepRounds,
  stepSets,
  stepWork,
  toggleWeekday,
  updateDay,
  withKind,
  workText,
} from "./programEdit"
import { begin, finish, OPEN_GATE, observed } from "./writeGate"

const isSlug = (text: string) => Option.isSome(Schema.decodeUnknownOption(Slug)(text))

const days = CORE30.days

describe("slugWithSuffix (slugify + a random suffix)", () => {
  it("lower-cases and joins words with one hyphen", () => {
    expect(slugWithSuffix("Push  Pull   Legs", "ab12")).toBe("push-pull-legs-ab12")
  })

  it("folds accents", () => {
    expect(slugWithSuffix("Évening Crème brûlée", "ab12")).toBe("evening-creme-brulee-ab12")
  })

  it("drops symbols and edge hyphens", () => {
    expect(slugWithSuffix("  --My 5x5 (heavy!) -- ", "ab12")).toBe("my-5x5-heavy-ab12")
  })

  it("falls back for text with no letters or digits", () => {
    expect(slugWithSuffix("鍛錬 !!!", "ab12")).toBe("program-ab12")
    expect(isSlug(slugWithSuffix("", "ab12"))).toBe(true)
  })

  it("never ends the base in a hyphen and satisfies Slug at the length cut", () => {
    const slug = slugWithSuffix(`${"abcd ".repeat(30)}tail`, "ab12")
    expect(slug.length).toBeLessThanOrEqual(64)
    expect(slug).not.toContain("--")
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

describe("days", () => {
  it("moveDay swaps two days, renumbers, and a leading 'Day N' in a title follows its place", () => {
    const [first, second] = days
    expect(first).toBeDefined()
    expect(second).toBeDefined()
    if (first === undefined || second === undefined) {
      return
    }
    const moved = moveDay(
      [
        { ...first, title: "Day 1 · Warm-up" },
        { ...second, title: "Day 2 · Build" },
      ],
      0,
      1,
    )
    expect(Arr.map(moved, (day) => day.dayNumber)).toEqual([1, 2])
    expect(Arr.map(moved, (day) => day.title)).toEqual(["Day 1 · Build", "Day 2 · Warm-up"])
    expect(moved[0]?.items).toEqual(second.items)
  })

  it("moveDay up at the first day is a no-op", () => {
    expect(moveDay(days, 0, -1)).toEqual(days)
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

  it("stepWork and workText follow the kind", () => {
    const reps = withKind(BLANK_ITEM, "reps")
    expect(workText(Arr.reduce(Arr.range(1, 3), BLANK_ITEM, (item) => stepWork(item, 1)))).toBe(
      "45 s",
    )
    expect(workText(Arr.reduce(Arr.range(1, 9), reps, (item) => stepWork(item, -1)))).toBe("1 rep")
    expect(workText(Arr.reduce(Arr.range(1, 2), reps, (item) => stepWork(item, 1)))).toBe("12 reps")
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

describe("queued steps", () => {
  const day: ProgramDay = {
    dayNumber: 1,
    title: "Day 1",
    rounds: 2,
    items: [withKind(BLANK_ITEM, "reps"), BLANK_ITEM],
    restBetweenRoundsSeconds: 60,
  }
  const twice = <A>(start: A, change: (value: A) => A): A => change(change(start))

  it("two work-value taps on the same stored row give +2, not +1", () => {
    const stored = twice(day, (current) => mapItem(current, 0, (item) => stepWork(item, 1)))
    expect(stored.items[0]).toMatchObject({ kind: "reps", reps: 12 })
  })

  it("a tap after a reorder began is DROPPED by the gate, not applied to a stale index", () => {
    // moveItem addresses positions; while its write is pending the rendered index is about to shift.
    const reorderPending = Option.getOrThrow(begin(OPEN_GATE, "positional"))
    expect(Option.isNone(begin(reorderPending, "queued"))).toBe(true)
    // once the reorder landed, the tap applies to the item now at that position
    const moved = { ...day, items: moveItem(day.items, 0, 1) }
    const settled = observed(finish(reorderPending, "positional", Option.some(2)), 2)
    expect(Option.isSome(begin(settled, "queued"))).toBe(true)
    expect(mapItem(moved, 0, (item) => stepWork(item, 1)).items[0]).toMatchObject({
      kind: "timed",
      seconds: 35,
    })
  })

  it("steps clamp at the ends of their ranges", () => {
    expect(twice(day, (current) => stepRounds(current, 1)).rounds).toBe(4)
    expect(twice({ ...day, rounds: 5 }, (current) => stepRounds(current, 1)).rounds).toBe(5)
    expect(stepRestBetweenRounds(day, 1).restBetweenRoundsSeconds).toBe(75)
    expect(stepRest(BLANK_ITEM, -1).restSeconds).toBe(25)
    const floor = Arr.reduce(Arr.range(1, 10), BLANK_ITEM, (item) => stepWork(item, -1))
    expect(floor).toMatchObject({ kind: "timed", seconds: 10 })
    const top = Arr.reduce(Arr.range(1, 120), BLANK_ITEM, (item) => stepWork(item, 1))
    expect(top).toMatchObject({ kind: "timed", seconds: 600 })
    expect(Arr.reduce(Arr.range(1, 70), BLANK_ITEM, (item) => stepRest(item, 1)).restSeconds).toBe(
      300,
    )
    expect(stepRestBetweenRounds({ ...day, restBetweenRoundsSeconds: 0 }, -1)).toMatchObject({
      restBetweenRoundsSeconds: 0,
    })
  })

  it("scheduleCaption names a schedule no segment shows, and is silent otherwise", () => {
    expect(scheduleCaption({ kind: "daysPerWeek", days: 4 })).toEqual(Option.none())
    expect(scheduleCaption({ kind: "weekdays", weekdays: ["mon"] })).toEqual(Option.none())
    expect(scheduleCaption({ kind: "daysPerWeek", days: 7 })).toEqual(Option.some("Every day"))
    expect(scheduleCaption({ kind: "daysPerWeek", days: 2 })).toEqual(Option.some("2 days a week"))
    expect(scheduleCaption({ kind: "daysPerWeek", days: 1 })).toEqual(Option.some("1 day a week"))
  })
})

describe("sets stepper (programs-player-v2 §7.3)", () => {
  const reps = withKind(BLANK_ITEM, "reps")

  it("a new reps item has 1 set and steps within 1-10", () => {
    expect(reps.kind === "reps" ? reps.sets : 0).toBe(1)
    expect(stepSets(reps, -1)).toEqual(reps)
    const ten = Arr.reduce(Arr.range(1, 12), reps, (item) => stepSets(item, 1))
    expect(ten.kind === "reps" ? ten.sets : 0).toBe(10)
  })

  it("leaves a timed item unchanged and reads '1 set' / '4 sets'", () => {
    expect(stepSets(BLANK_ITEM, 1)).toBe(BLANK_ITEM)
    expect([setsText(1), setsText(4)]).toEqual(["1 set", "4 sets"])
  })
})

describe("typed entry (tap-to-type on the editor steppers)", () => {
  const reps = withKind(BLANK_ITEM, "reps")
  const day: ProgramDay = {
    dayNumber: 1,
    title: "Day 1",
    rounds: 2,
    items: [BLANK_ITEM],
    restBetweenRoundsSeconds: 60,
  }

  it("clamps seconds into 10–600", () => {
    expect([enterWork(BLANK_ITEM, "7"), enterWork(BLANK_ITEM, "999")]).toMatchObject([
      { seconds: 10 },
      { seconds: 600 },
    ])
  })

  it("snaps seconds to the 5 s grid", () => {
    expect(enterWork(BLANK_ITEM, "33")).toMatchObject({ kind: "timed", seconds: 35 })
  })

  it("snaps rest between rounds to the nearest 15 s, a tie rounding up", () => {
    expect(
      ["20", "22.5", "23"].map((raw) => enterRestBetweenRounds(day, raw).restBetweenRoundsSeconds),
    ).toEqual([15, 30, 30])
  })

  it("rounds reps and sets to whole numbers and clamps sets to 10", () => {
    expect(enterWork(reps, "7.4")).toMatchObject({ kind: "reps", reps: 7 })
    expect(enterSets(reps, "20")).toMatchObject({ sets: 10 })
  })

  it("keeps the value when the text is empty or not a number", () => {
    expect([enterWork(BLANK_ITEM, ""), enterRest(BLANK_ITEM, "abc")]).toEqual([
      BLANK_ITEM,
      BLANK_ITEM,
    ])
    expect(enterRounds(day, "  ")).toBe(day)
  })

  it("sets rest and rounds inside their ranges", () => {
    expect(enterRest(BLANK_ITEM, "47").restSeconds).toBe(45)
    expect(enterRounds(day, "9").rounds).toBe(5)
  })

  it("leaves a timed item's sets alone", () => {
    expect(enterSets(BLANK_ITEM, "4")).toBe(BLANK_ITEM)
  })

  it("never returns NaN for a garbage draft", () => {
    expect(fitTyped("1e999", { min: 0, max: 300, step: 5 })).toEqual(Option.none())
  })
})
