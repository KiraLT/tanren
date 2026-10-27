import { describe, expect, it } from "@effect/vitest"
import { Option } from "effect"
import { doneLine, exerciseNames, finishedOn, sessionMeta, startLabel, startTarget } from "./upNext"

const due = [{ enrollment: { id: "enr-1" } }, { enrollment: { id: "enr-2" } }]
const open = Option.some({})

describe("startTarget", () => {
  it("planned session beats a due program day", () => {
    expect(startTarget({ _tag: "Ready", session: Option.none() }, due)).toEqual({
      _tag: "Session",
      resume: false,
    })
    expect(startTarget({ _tag: "Ready", session: open }, due)).toEqual({
      _tag: "Session",
      resume: true,
    })
  })

  it("an open free workout beats a due program day", () => {
    expect(startTarget({ _tag: "Free", exercises: [{}], session: open }, due)).toEqual({
      _tag: "Session",
      resume: true,
    })
    expect(startTarget({ _tag: "Free", exercises: [], session: Option.none() }, due)).toEqual({
      _tag: "AddExercise",
    })
  })

  it("a free workout with exercises but no set yet continues", () => {
    expect(startTarget({ _tag: "Free", exercises: [{}], session: Option.none() }, [])).toEqual({
      _tag: "Session",
      resume: true,
    })
  })

  it("the first due program day beats a free workout", () => {
    expect(startTarget({ _tag: "Empty" }, due)).toEqual({ _tag: "Program", enrollmentId: "enr-1" })
  })

  it("nothing planned or due starts a free workout", () => {
    expect(startTarget({ _tag: "Empty" }, [])).toEqual({ _tag: "Free" })
  })

  it("loading and failed resolve to none", () => {
    expect(startTarget({ _tag: "Loading" }, due)).toEqual({ _tag: "None" })
    expect(startTarget({ _tag: "Failed" }, due)).toEqual({ _tag: "None" })
  })
})

describe("startLabel", () => {
  it("names the action", () => {
    expect(startLabel({ _tag: "Session", resume: true })).toBe("Continue")
    expect(startLabel({ _tag: "Session", resume: false })).toBe("Start")
    expect(startLabel({ _tag: "AddExercise" })).toBe("Add exercise")
    expect(startLabel({ _tag: "Program", enrollmentId: "x" })).toBe("Start")
    expect(startLabel({ _tag: "Free" })).toBe("Start")
  })
})

describe("sessionMeta", () => {
  const item = (name: string, sets: number, restSeconds: number) => ({
    exercise: { name },
    plannedSets: Array.from({ length: sets }, () => ({})),
    restSeconds,
  })

  it("counts exercises, sets and minutes (rest + 45 s per set)", () => {
    // 3 × (90 + 45) + 2 × (75 + 45) = 405 + 240 = 645 s ≈ 11 min
    expect(sessionMeta([item("Leg press", 3, 90), item("RDL", 2, 75)])).toBe(
      "2 exercises · 5 sets · ≈ 11 min",
    )
  })

  it("singular words and no minutes without planned sets", () => {
    expect(sessionMeta([item("Plank", 1, 15)])).toBe("1 exercise · 1 set · ≈ 1 min")
    expect(sessionMeta([item("Curl", 0, 90)])).toBe("1 exercise")
  })

  it("lists the names in order", () => {
    expect(exerciseNames([item("Leg press", 1, 0), item("RDL", 1, 0)])).toBe("Leg press, RDL")
  })
})

describe("startTarget with a workout done today", () => {
  it("demotes a fresh planned session to Done with Start another", () => {
    const target = startTarget({ _tag: "Ready", session: Option.none() }, [], 1)
    expect(target).toEqual({ _tag: "Done", next: { _tag: "Session", resume: false } })
    expect(startLabel(target)).toBe("Start another")
  })

  it("demotes a new free workout to Done", () => {
    expect(startTarget({ _tag: "Empty" }, [], 2)).toEqual({ _tag: "Done", next: { _tag: "Free" } })
  })

  it("keeps an open session, a started free workout and a due program day primary", () => {
    expect(startTarget({ _tag: "Ready", session: Option.some({}) }, [], 1)).toEqual({
      _tag: "Session",
      resume: true,
    })
    expect(startTarget({ _tag: "Free", exercises: [], session: Option.none() }, [], 1)).toEqual({
      _tag: "AddExercise",
    })
    expect(startTarget({ _tag: "Empty" }, due, 1)).toEqual({
      _tag: "Program",
      enrollmentId: "enr-1",
    })
  })

  it("loading stays none", () => {
    expect(startTarget({ _tag: "Loading" }, [], 1)).toEqual({ _tag: "None" })
  })
})

describe("finishedOn and doneLine", () => {
  const items = [
    { status: "done" as const, date: "2026-10-27", sets: 18, volumeKg: 4200 },
    { status: "inProgress" as const, date: "2026-10-27", sets: 3, volumeKg: 300 },
    { status: "done" as const, date: "2026-10-26", sets: 12, volumeKg: 2000 },
  ]

  it("keeps only workouts finished today", () => {
    expect(finishedOn(items, "2026-10-27")).toEqual([items[0]])
  })

  it("sums sets and volume, counting workouts only when more than one", () => {
    const kg = (n: number) => `${n} kg`
    expect(doneLine([{ sets: 18, volumeKg: 4200 }], kg)).toBe("18 sets · 4200 kg")
    expect(
      doneLine(
        [
          { sets: 1, volumeKg: 0 },
          { sets: 2, volumeKg: 0 },
        ],
        kg,
      ),
    ).toBe("2 workouts · 3 sets")
  })
})
