import { describe, expect, it } from "@effect/vitest"
import { Array as Arr, Effect, Option, Schema } from "effect"
import { findCatalogExercise } from "../catalog"
import { CatalogId } from "../catalog/taxonomy"
import { findProgram, PROGRAMS } from "./index"
import { LEAN_BUILD_12 } from "./leanBuild"
import { dayDurationSeconds, Program, type ProgramDay, ProgramId } from "./Program"

const days = LEAN_BUILD_12.days
const allItems = Arr.flatMap(days, (day) => day.items)
const isRecovery = (day: ProgramDay) => day.dayNumber % 7 === 0
const minutes = (day: ProgramDay) => dayDurationSeconds(day) / 60
const dayOf = (dayNumber: number) => Arr.findFirst(days, (d) => d.dayNumber === dayNumber)
const idsOf = (day: ProgramDay) => day.items.map((item) => item.catalogId)

/** First item of a day as `kind:value:rest`, e.g. `reps:12:60`. */
const firstItem = (dayNumber: number) =>
  dayOf(dayNumber).pipe(
    Option.flatMap((day) => Arr.head(day.items)),
    Option.map((item) =>
      item.kind === "reps"
        ? `reps:${item.reps}:${item.restSeconds}`
        : `timed:${item.seconds}:${item.restSeconds}`,
    ),
  )

/** The i-th item (0-based) of a day, same format. */
const itemAt = (dayNumber: number, index: number) =>
  dayOf(dayNumber).pipe(
    Option.flatMap((day) => Arr.get(day.items, index)),
    Option.map((item) =>
      item.kind === "reps"
        ? `reps:${item.reps}:${item.restSeconds}`
        : `timed:${item.seconds}:${item.restSeconds}`,
    ),
  )

describe("LEAN_BUILD_12", () => {
  it.effect("round-trips through the Program codec", () =>
    Effect.gen(function* () {
      const encoded = yield* Schema.encodeEffect(Program)(LEAN_BUILD_12)
      const decoded = yield* Schema.decodeUnknownEffect(Program)(encoded)
      expect(decoded).toEqual(LEAN_BUILD_12)
    }),
  )

  it("is the 12-Week Lean Build with 84 contiguous days", () => {
    expect(LEAN_BUILD_12.programId).toBe("lean-build-12")
    expect(LEAN_BUILD_12.name).toBe("12-Week Lean Build")
    expect(days.map((day) => day.dayNumber)).toEqual(Arr.makeBy(84, (i) => i + 1))
  })

  it("resolves every catalog id", () => {
    const unresolved = allItems.filter((item) =>
      Option.match(Schema.decodeUnknownOption(CatalogId)(item.catalogId), {
        onNone: () => true,
        onSome: (id) => Option.isNone(findCatalogExercise(id)),
      }),
    )
    expect(unresolved).toEqual([])
  })

  it("gives every item the mode of its catalog kind (distance runs as timed)", () => {
    const mismatched = allItems.filter((item) => {
      const kind = Option.map(findCatalogExercise(item.catalogId), (entry) => entry.kind)
      return !Option.isSome(kind) || (kind.value === "reps") !== (item.kind === "reps")
    })
    expect(mismatched).toEqual([])
  })

  it("makes every seventh day a single-round recovery of four items", () => {
    const recoveryDays = days.filter(isRecovery)
    expect(recoveryDays).toHaveLength(12)
    expect(recoveryDays.map((day) => [day.rounds, day.items.length])).toEqual(
      Arr.replicate([1, 4], 12),
    )
    expect(recoveryDays.filter((day) => minutes(day) >= 5)).toEqual([])
  })

  it("counts items per day type: push 7, pull 7, legs 7, upper 6, cardio 4, recovery 4", () => {
    const countsBySlot = Arr.makeBy(7, (slot) =>
      days.filter((day) => (day.dayNumber - 1) % 7 === slot).map((day) => day.items.length),
    )
    expect(countsBySlot).toEqual([
      Arr.replicate(7, 12),
      Arr.replicate(7, 12),
      Arr.replicate(4, 12),
      Arr.replicate(7, 12),
      Arr.replicate(6, 12),
      Arr.replicate(4, 12),
      Arr.replicate(4, 12),
    ])
  })

  it("runs strength days as 3 reps-only rounds and cardio days as 1 round", () => {
    const slotOf = (day: ProgramDay) => (day.dayNumber - 1) % 7
    const strength = days.filter((day) => [0, 1, 3, 4].includes(slotOf(day)))
    const cardio = days.filter((day) => [2, 5].includes(slotOf(day)))
    expect(strength.map((day) => day.rounds)).toEqual(Arr.replicate(3, strength.length))
    expect(Arr.flatMap(strength, (day) => day.items).filter((i) => i.kind !== "reps")).toEqual([])
    expect(cardio.map((day) => [day.rounds, day.restBetweenRoundsSeconds])).toEqual(
      Arr.replicate([1, 0], cardio.length),
    )
  })

  it("gives the last item of a round the round rest", () => {
    const mismatched = days.filter(
      (day) =>
        Arr.last(day.items).pipe(
          Option.map((item) => item.restSeconds),
          Option.getOrUndefined,
        ) !== day.restBetweenRoundsSeconds,
    )
    expect(mismatched).toEqual([])
  })

  it("keeps every non-recovery day inside 20-35 minutes", () => {
    const outside = days.filter(
      (day) => !isRecovery(day) && (minutes(day) < 20 || minutes(day) > 35),
    )
    expect(outside.map((day) => [day.dayNumber, Math.round(minutes(day))])).toEqual([])
  })

  it("estimates the design's duration checks (push b1 1701 s, push b3 1962 s, cardio A b3 1950 s)", () => {
    const seconds = [1, 57, 59].map((n) =>
      Option.getOrElse(Option.map(dayOf(n), dayDurationSeconds), () => -1),
    )
    expect(seconds).toEqual([1701, 1962, 1950])
  })

  it("titles days by week and slot", () => {
    const title = (n: number) => Option.map(dayOf(n), (day) => day.title)
    expect(title(1)).toEqual(Option.some("Day 1 · Week 1 · Push"))
    expect(title(3)).toEqual(Option.some("Day 3 · Week 1 · Cardio A"))
    expect(title(7)).toEqual(Option.some("Day 7 · Week 1 · Recovery"))
    expect(title(29)).toEqual(Option.some("Day 29 · Week 5 · Push"))
    expect(title(84)).toEqual(Option.some("Day 84 · Week 12 · Recovery"))
  })

  it("lays out the week as push, pull, cardio A, legs, upper, cardio B, recovery", () => {
    const first = Arr.makeBy(7, (i) => idsOf(Option.getOrThrow(dayOf(i + 1)))[0])
    expect(first).toEqual([
      "barbell-bench-press",
      "lat-pulldown",
      "incline-treadmill-walk",
      "barbell-back-squat",
      "machine-chest-press",
      "elliptical-trainer",
      "bird-dog",
    ])
  })

  it("repeats the same exercises in every week of a block and across blocks", () => {
    const week = (w: number) => Arr.take(Arr.drop(days, (w - 1) * 7), 7).map(idsOf)
    expect(week(2)).toEqual(week(1))
    expect(week(5)).toEqual(week(1))
    expect(week(12)).toEqual(week(1))
  })

  it("steps main reps 12 -> 10 -> 8 and main rest 60 -> 75 -> 90 per block", () => {
    expect([1, 22, 29, 50, 57, 78].map(firstItem)).toEqual([
      Option.some("reps:12:60"),
      Option.some("reps:12:60"),
      Option.some("reps:10:75"),
      Option.some("reps:10:75"),
      Option.some("reps:8:90"),
      Option.some("reps:8:90"),
    ])
  })

  it("steps accessory reps 15 -> 12 -> 12 and rest 45 -> 45 -> 60 (cable fly, push item 4)", () => {
    expect([1, 29, 57].map((n) => itemAt(n, 3))).toEqual([
      Option.some("reps:15:45"),
      Option.some("reps:12:45"),
      Option.some("reps:12:60"),
    ])
  })

  it("stretches cardio 15 -> 20 -> 25 minutes per block (bike on A, intervals on B)", () => {
    expect([3, 31, 59].map((n) => itemAt(n, 1))).toEqual([
      Option.some("timed:900:60"),
      Option.some("timed:1200:60"),
      Option.some("timed:1500:60"),
    ])
    expect([6, 34, 62].map((n) => itemAt(n, 1))).toEqual([
      Option.some("timed:900:60"),
      Option.some("timed:1200:60"),
      Option.some("timed:1500:60"),
    ])
  })

  it("makes week 5 differ from week 1 and each block longer than the last on a push day", () => {
    const length = (n: number) =>
      Option.getOrElse(Option.map(dayOf(n), dayDurationSeconds), () => 0)
    expect(dayOf(29)).not.toEqual(dayOf(1))
    expect(length(29)).toBeGreaterThan(length(1))
    expect(length(57)).toBeGreaterThan(length(29))
  })

  it("keeps recovery days the same through the whole program", () => {
    const shapes = Arr.dedupe(days.filter(isRecovery).map((day) => JSON.stringify(day.items)))
    expect(shapes).toHaveLength(1)
  })

  it("is listed in PROGRAMS beside Core 30", () => {
    expect(PROGRAMS.map((program) => program.programId)).toEqual(["core-30", "lean-build-12"])
    expect(Option.getOrUndefined(findProgram(ProgramId.make("lean-build-12")))).toBe(LEAN_BUILD_12)
  })
})
