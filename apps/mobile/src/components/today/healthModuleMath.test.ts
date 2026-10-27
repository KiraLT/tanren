import { describe, expect, it } from "@effect/vitest"
import {
  type DayTotals,
  FoodEntry,
  FoodEntryId,
  type FoodItem,
  LocalDate,
  totalsOf,
  UserId,
} from "@tanren/shared"
import { DateTime, Option } from "effect"
import {
  freshnessLine,
  heroNumber,
  isStale,
  metaLine,
  ringFractions,
  ringsLabel,
} from "./healthModuleMath"

const VILNIUS = DateTime.zoneMakeNamedUnsafe("Europe/Vilnius")
/** 16:30 in Vilnius (EET, UTC+2 on 2026-10-27). */
const NOW = new Date("2026-10-27T14:30:00.000Z")
/** 14:05 in Vilnius the same day. */
const AS_OF = DateTime.makeUnsafe("2026-10-27T12:05:00.000Z")

const lunchItem: FoodItem = {
  name: "Chicken and rice",
  portion: "1 plate",
  grams: Option.none(),
  kcal: 1420,
  proteinG: 96,
  carbsG: 150,
  fatG: 50,
  fibreG: Option.none(),
  confidence: Option.none(),
}

/** One logged entry: the rings and the numeral read only whether the day has entries. */
const ONE_ENTRY: ReadonlyArray<FoodEntry> = [
  new FoodEntry({
    id: FoodEntryId.make("00000000-0000-4000-8000-000000000001"),
    userId: UserId.make("00000000-0000-4000-8000-0000000000aa"),
    createdAt: AS_OF,
    updatedAt: AS_OF,
    deletedAt: Option.none(),
    loggedAt: AS_OF,
    meal: "lunch",
    source: "mcp",
    items: [lunchItem],
    ...totalsOf([lunchItem]),
    note: Option.none(),
  }),
]

/** §6 "all present": budget 3,070, eaten 1,420 (1,650 left), protein 96 / 155 g, Garmin 1,840. */
const allPresent: DayTotals = {
  date: LocalDate.make("2026-10-27"),
  eaten: { kcal: 1420, proteinG: 96, carbsG: 150, fatG: 50 },
  burned: Option.some(1840),
  activeBurned: Option.some(420),
  steps: Option.some(8420),
  burnedAsOf: Option.some(AS_OF),
  targets: Option.some({ kcal: 3070, proteinG: 155, goal: "gain_muscle" }),
  budgetKcal: Option.some(3070),
  kcalLeft: Option.some(1650),
  proteinLeftG: Option.some(59),
  entries: ONE_ENTRY,
}

/** §6 "over budget": 3,290 eaten of 3,070. */
const overBudget: DayTotals = {
  ...allPresent,
  eaten: { ...allPresent.eaten, kcal: 3290 },
  kcalLeft: Option.some(-220),
}

/** §6 "no profile, Garmin on". */
const noTargets: DayTotals = {
  ...allPresent,
  targets: Option.none(),
  budgetKcal: Option.none(),
  kcalLeft: Option.none(),
  proteinLeftG: Option.none(),
}

/** §6 "Garmin off": no `daily_health` row for the day. */
const garminOff: DayTotals = {
  ...allPresent,
  burned: Option.none(),
  activeBurned: Option.none(),
  steps: Option.none(),
  burnedAsOf: Option.none(),
}

describe("ringFractions", () => {
  it("gives eaten / budget and protein / target when every value is present", () => {
    const rings = ringFractions(allPresent)
    expect(Option.getOrThrow(rings.eaten)).toBeCloseTo(0.4625, 4)
    expect(Option.getOrThrow(rings.protein)).toBeCloseTo(0.619, 3)
    expect(rings.over).toBe(false)
  })

  it("clamps the eaten ring to full and flags over budget", () => {
    const rings = ringFractions(overBudget)
    expect(rings.eaten).toEqual(Option.some(1))
    expect(rings.over).toBe(true)
  })

  it("has no fractions without targets", () => {
    const rings = ringFractions(noTargets)
    expect(rings).toEqual({ eaten: Option.none(), protein: Option.none(), over: false })
  })
})

describe("ringsLabel", () => {
  it("states both fractions in whole percent", () => {
    expect(ringsLabel(ringFractions(allPresent))).toBe(
      "Eaten 46 percent of budget, protein 62 percent of target",
    )
  })

  it("says over budget instead of a clamped 100 percent", () => {
    expect(ringsLabel(ringFractions(overBudget))).toBe("Over budget, protein 62 percent of target")
  })

  it("says the rings are empty without a goal", () => {
    expect(ringsLabel(ringFractions(noTargets))).toBe(
      "No goal set: calorie and protein rings empty",
    )
  })
})

describe("heroNumber", () => {
  it("shows kcal left against the budget", () => {
    expect(heroNumber(allPresent)).toEqual({
      label: "Left today",
      value: "1,650",
      tone: "neutral",
      caption: "of 3,070 kcal budget",
    })
  })

  it("shows the overshoot with a minus sign in danger", () => {
    expect(heroNumber(overBudget)).toMatchObject({
      label: "Over today",
      value: "−220",
      tone: "danger",
      caption: "of 3,070 kcal budget",
    })
  })

  it("says nothing is logged yet while the day has no entries", () => {
    const fresh: DayTotals = {
      ...allPresent,
      eaten: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
      kcalLeft: Option.some(3070),
      entries: [],
    }
    expect(heroNumber(fresh)).toMatchObject({ value: "3,070", caption: "nothing logged yet" })
  })

  it("falls back to burned today without targets", () => {
    expect(heroNumber(noTargets)).toEqual({
      label: "Burned today",
      value: "1,840",
      tone: "neutral",
      caption: "Set a goal for a budget",
    })
  })

  it("shows a dash for burned without targets or a tracker", () => {
    expect(heroNumber({ ...noTargets, burned: Option.none() }).value).toBe("—")
  })
})

describe("isStale", () => {
  it("is true for a burnedAsOf dated yesterday in the device zone", () => {
    const lateYesterday = DateTime.makeUnsafe("2026-10-26T21:40:00.000Z") // 23:40 Vilnius
    expect(isStale(Option.some(lateYesterday), NOW, VILNIUS)).toBe(true)
  })

  it("is false for a burnedAsOf dated today in the device zone", () => {
    const pastUtcMidnight = DateTime.makeUnsafe("2026-10-26T22:10:00.000Z") // 00:10 Vilnius
    expect(isStale(Option.some(pastUtcMidnight), NOW, VILNIUS)).toBe(false)
  })

  it("is false without a burnedAsOf", () => {
    expect(isStale(Option.none(), NOW, VILNIUS)).toBe(false)
  })
})

describe("metaLine", () => {
  it("reads as of HH:MM and steps, never resting heart rate (Amendment 26)", () => {
    expect(metaLine(allPresent, NOW, VILNIUS, true)).toBe("as of 14:05 · 8,420 steps")
  })

  it("drops the steps when the tracker reports none", () => {
    expect(metaLine({ ...allPresent, steps: Option.none() }, NOW, VILNIUS, true)).toBe(
      "as of 14:05",
    )
  })

  it("says no tracker is connected without a daily_health row and no tracker", () => {
    expect(metaLine(garminOff, NOW, VILNIUS, false)).toBe("No tracker connected")
  })

  it("says Waiting for Garmin, not No tracker connected, when connected but not pulled today", () => {
    expect(metaLine(garminOff, NOW, VILNIUS, true)).toBe("Waiting for Garmin")
  })

  it("keeps the line without targets", () => {
    expect(metaLine(noTargets, NOW, VILNIUS, true)).toBe("as of 14:05 · 8,420 steps")
  })

  it("prefixes yesterday for a stale burnedAsOf", () => {
    const stale = {
      ...allPresent,
      burnedAsOf: Option.some(DateTime.makeUnsafe("2026-10-26T21:40:00.000Z")),
    }
    expect(metaLine(stale, NOW, VILNIUS, true)).toBe("as of yesterday 23:40 · 8,420 steps")
  })

  it("prefixes the date for an older burnedAsOf", () => {
    const older = {
      ...allPresent,
      burnedAsOf: Option.some(DateTime.makeUnsafe("2026-10-24T08:00:00.000Z")),
    }
    expect(metaLine(older, NOW, VILNIUS, true)).toBe("as of 24 Oct 11:00 · 8,420 steps")
  })
})

describe("freshnessLine", () => {
  it("reads only the clock for a row from today", () => {
    expect(freshnessLine(allPresent, NOW, VILNIUS, true)).toBe("as of 14:05")
  })

  it("keeps the date for an older row, without the steps", () => {
    const older = {
      ...allPresent,
      burnedAsOf: Option.some(DateTime.makeUnsafe("2026-10-24T08:00:00.000Z")),
    }
    expect(freshnessLine(older, NOW, VILNIUS, true)).toBe("as of 24 Oct 11:00")
  })

  it("says no tracker is connected without a daily_health row and no tracker", () => {
    expect(freshnessLine(garminOff, NOW, VILNIUS, false)).toBe("No tracker connected")
  })

  it("says Waiting for Garmin, not No tracker connected, when connected but not pulled today", () => {
    expect(freshnessLine(garminOff, NOW, VILNIUS, true)).toBe("Waiting for Garmin")
  })
})

describe("heroNumber at the budget edge", () => {
  it("reads Left today 0 in neutral when the budget is exactly used", () => {
    expect(heroNumber({ ...allPresent, kcalLeft: Option.some(0) })).toMatchObject({
      label: "Left today",
      value: "0",
      tone: "neutral",
    })
  })

  it("turns Over today −1 in danger one kcal past the budget", () => {
    expect(heroNumber({ ...allPresent, kcalLeft: Option.some(-1) })).toMatchObject({
      label: "Over today",
      value: "−1",
      tone: "danger",
    })
  })
})

describe("ringFractions with zero targets", () => {
  it("clamps protein to a full ring, not Infinity, for a protein target of 0", () => {
    const zeroProtein: DayTotals = {
      ...allPresent,
      targets: Option.some({ kcal: 3070, proteinG: 0, goal: "gain_muscle" }),
    }
    expect(ringFractions(zeroProtein).protein).toEqual(Option.some(1))
  })

  it("clamps eaten to a full ring, not Infinity, for a budget of 0", () => {
    expect(ringFractions({ ...allPresent, budgetKcal: Option.some(0) }).eaten).toEqual(
      Option.some(1),
    )
  })

  it("reads 0, not NaN, with nothing eaten against a budget of 0", () => {
    const empty: DayTotals = {
      ...allPresent,
      eaten: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
      budgetKcal: Option.some(0),
      targets: Option.some({ kcal: 0, proteinG: 0, goal: "gain_muscle" }),
    }
    expect(ringFractions(empty)).toMatchObject({ eaten: Option.some(0), protein: Option.some(0) })
  })
})
