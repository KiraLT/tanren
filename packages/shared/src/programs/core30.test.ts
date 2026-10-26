import { describe, expect, it } from "@effect/vitest"
import { Array as Arr, Effect, Option, Order, Schema } from "effect"
import { CORE30_CATALOG_IDS, findCatalogExercise } from "../catalog"
import { CORE30, REPS_BY_WORK_SECONDS } from "./core30"
import { findProgram } from "./index"
import { dayDurationSeconds, Program, type ProgramDay, ProgramId } from "./Program"

const RECOVERY_DAYS: ReadonlyArray<number> = [7, 14, 21, 28]
const isRecovery = (day: ProgramDay) => RECOVERY_DAYS.includes(day.dayNumber)
const trainingDays = CORE30.days.filter((day) => !isRecovery(day))
const recoveryDays = CORE30.days.filter(isRecovery)
const allItems = Arr.flatMap(CORE30.days, (day) => day.items)
const minutes = (day: ProgramDay) => dayDurationSeconds(day) / 60
const dayOf = (dayNumber: number) => Arr.findFirst(CORE30.days, (d) => d.dayNumber === dayNumber)
const catalogIds = (day: ProgramDay) => day.items.map((item) => item.catalogId)

describe("CORE30", () => {
  it.effect("round-trips through the Program codec", () =>
    Effect.gen(function* () {
      const encoded = yield* Schema.encodeEffect(Program)(CORE30)
      const decoded = yield* Schema.decodeUnknownEffect(Program)(encoded)
      expect(decoded).toEqual(CORE30)
    }),
  )

  it("is named Core 30 with 30 contiguous days", () => {
    expect(CORE30.programId).toBe("core-30")
    expect(CORE30.name).toBe("Core 30")
    expect(CORE30.days.map((day) => day.dayNumber)).toEqual(Arr.makeBy(30, (i) => i + 1))
  })

  it("only uses ids from CORE30_CATALOG_IDS", () => {
    expect(allItems.filter((item) => !CORE30_CATALOG_IDS.includes(item.catalogId))).toEqual([])
  })

  it("gives every item the mode of its catalog kind (distance runs as timed)", () => {
    const mismatched = allItems.filter((item) => {
      const kind = Option.map(findCatalogExercise(item.catalogId), (entry) => entry.kind)
      return !Option.isSome(kind) || (kind.value === "reps") !== (item.kind === "reps")
    })
    expect(mismatched).toEqual([])
  })

  it("uses only counts from the table, all even", () => {
    const counts = Arr.dedupe(allItems.flatMap((item) => (item.kind === "reps" ? [item.reps] : [])))
    expect(Arr.sort(counts, Order.Number)).toEqual([12, 16, 18, 20, 22])
    expect(counts.filter((count) => count % 2 !== 0)).toEqual([])
    const wrongCount = allItems.filter(
      (item) =>
        item.kind === "reps" && !Array.from(REPS_BY_WORK_SECONDS.values()).includes(item.reps),
    )
    expect(wrongCount).toEqual([])
  })

  it("starts day 1 with five counted items then two timed holds", () => {
    const modes = Option.map(dayOf(1), (day) =>
      day.items.map((item) => [item.catalogId, item.kind === "reps" ? "R" : "T"]),
    )
    expect(modes).toEqual(
      Option.some([
        ["dead-bug", "R"],
        ["crunch", "R"],
        ["reverse-crunch", "R"],
        ["lying-leg-raise", "R"],
        ["v-up", "R"],
        ["hollow-hold", "T"],
        ["plank", "T"],
      ]),
    )
  })

  it("estimates the planned length of days 1, 10, 16, 22, 29 and 30", () => {
    const seconds = [1, 10, 16, 22, 29, 30].map((n) =>
      Option.getOrElse(Option.map(dayOf(n), dayDurationSeconds), () => -1),
    )
    expect(seconds).toEqual([900, 1020, 1020, 1020, 1050, 1056])
  })

  it("maps 25/30/35/40/45/75 work seconds to 12/16/18/20/22/20 reps", () => {
    expect([...REPS_BY_WORK_SECONDS.entries()]).toEqual([
      [25, 12],
      [30, 16],
      [35, 18],
      [40, 20],
      [45, 22],
      [75, 20],
    ])
  })

  it("titles days by phase", () => {
    const title = (n: number) => Option.map(dayOf(n), (day) => day.title)
    expect(title(1)).toEqual(Option.some("Day 1 · Foundation"))
    expect(title(7)).toEqual(Option.some("Day 7 · Recovery"))
    expect(title(13)).toEqual(Option.some("Day 13 · Build"))
    expect(title(20)).toEqual(Option.some("Day 20 · Endure"))
    expect(title(27)).toEqual(Option.some("Day 27 · Forge"))
    expect(title(30)).toEqual(Option.some("Day 30 · Peak"))
  })

  it("makes recovery days 4 items × 1 round, about 4 minutes (3 counted at 2 s a rep)", () => {
    expect(recoveryDays).toHaveLength(4)
    expect(recoveryDays.map((day) => [day.rounds, day.items.length])).toEqual(
      Arr.replicate([1, 4], 4),
    )
    expect(recoveryDays.map((day) => Math.round(minutes(day)))).toEqual(Arr.replicate(4, 4))
  })

  it("makes training days 7 items × 3 rounds", () => {
    expect(trainingDays).toHaveLength(26)
    expect(trainingDays.map((day) => [day.rounds, day.items.length])).toEqual(
      Arr.replicate([3, 7], 26),
    )
  })

  it("keeps every training day inside 12-18 minutes", () => {
    expect(trainingDays.filter((day) => minutes(day) < 12 || minutes(day) > 18)).toEqual([])
  })

  it("gives the last item of a round the round rest", () => {
    const mismatched = CORE30.days.filter(
      (day) =>
        Arr.last(day.items)
          .pipe(Option.map((i) => i.restSeconds))
          .pipe(Option.getOrUndefined) !== day.restBetweenRoundsSeconds,
    )
    expect(mismatched).toEqual([])
  })

  it("progresses: work up, round rest down, day 30 at least as long as day 1", () => {
    const first = Option.getOrThrow(dayOf(1))
    const last = Option.getOrThrow(dayOf(30))
    const work = (day: ProgramDay) =>
      Arr.head(day.items).pipe(
        Option.map((item) => (item.kind === "timed" ? item.seconds : 0)),
        Option.getOrElse(() => 0),
      )
    expect(dayDurationSeconds(last)).toBeGreaterThanOrEqual(dayDurationSeconds(first))
    expect(work(last)).toBeGreaterThan(work(first))
    expect(last.restBetweenRoundsSeconds).toBeLessThan(first.restBetweenRoundsSeconds)
  })

  it("never repeats the item list on consecutive days", () => {
    const repeats = Arr.zip(CORE30.days, Arr.drop(CORE30.days, 1)).filter(
      ([a, b]) => JSON.stringify(catalogIds(a)) === JSON.stringify(catalogIds(b)),
    )
    expect(repeats).toEqual([])
  })

  it("is listed in PROGRAMS", () => {
    const found = findProgram(ProgramId.make("core-30"))
    expect(Option.getOrUndefined(found)).toBe(CORE30)
  })
})
