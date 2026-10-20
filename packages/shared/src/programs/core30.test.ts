import { describe, expect, it } from "@effect/vitest"
import { Array as Arr, Effect, Option, Schema } from "effect"
import { CORE30_CATALOG_IDS, findCatalogExercise } from "../catalog"
import { CORE30 } from "./core30"
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

  it("only uses timed items, matching the catalog kind", () => {
    expect(allItems.filter((item) => item.kind !== "timed")).toEqual([])
    const kinds = Arr.dedupe(allItems.map((item) => item.catalogId)).map((id) =>
      Option.map(findCatalogExercise(id), (entry) => entry.kind),
    )
    expect(kinds.filter((kind) => Option.isSome(kind) && kind.value !== "timed")).toEqual([])
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

  it("makes recovery days 4 items × 1 round, about 6 minutes", () => {
    expect(recoveryDays).toHaveLength(4)
    expect(recoveryDays.map((day) => [day.rounds, day.items.length])).toEqual(
      Arr.replicate([1, 4], 4),
    )
    expect(recoveryDays.map((day) => Math.round(minutes(day)))).toEqual(Arr.replicate(6, 4))
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
