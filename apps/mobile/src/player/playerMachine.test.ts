import { describe, expect, it } from "@effect/vitest"
import { dayDurationSeconds, ProgramDay } from "@tanren/shared"
import { Array as Arr, Option, Schema } from "effect"
import {
  currentItem,
  idle,
  type PlayerConfig,
  type PlayerEventTag,
  type PlayerState,
  phaseKey,
  playerEvent,
  progress,
  remainingMs,
  step,
  upNext,
} from "./playerMachine"

const timed = (catalogId: string, seconds: number, restSeconds: number) => ({
  kind: "timed",
  catalogId,
  seconds,
  restSeconds,
})

/** 2 items × 2 rounds. Timeline from start at T0 = 1 000 ms (speed 1):
 * W(0,0) 1 000–31 000 · R(0,0) –41 000 · W(0,1) –61 000 · R between rounds –121 000 ·
 * W(1,0) –151 000 · R(1,0) –161 000 · W(1,1) –181 000 · Done (180 s). */
const day = Schema.decodeUnknownSync(ProgramDay)({
  dayNumber: 1,
  title: "Day 1 · Foundation",
  rounds: 2,
  items: [timed("plank", 30, 10), timed("side-plank", 20, 5)],
  restBetweenRoundsSeconds: 60,
})
const config: PlayerConfig = { day, speed: 1 }
const T0 = 1000

type Ev = readonly [PlayerEventTag, number]
const ALL: ReadonlyArray<PlayerEventTag> = [
  "start",
  "tick",
  "pause",
  "resume",
  "next",
  "previous",
  "finish",
]

const runEvents = (
  events: ReadonlyArray<Ev>,
  from: PlayerState = idle,
  cfg: PlayerConfig = config,
): PlayerState =>
  Arr.reduce(events, from, (state, [tag, nowMs]) => step(cfg)(state, playerEvent(tag, nowMs)))

const started = runEvents([["start", T0]])

/** Ticks every 250 ms from `fromMs` until Done (bounded), returning every intermediate state. */
const tickTrace = (
  start: PlayerState,
  fromMs: number,
  cfg: PlayerConfig = config,
): ReadonlyArray<PlayerState> =>
  Arr.scan(Arr.range(1, 2000), start, (state, n) =>
    step(cfg)(state, playerEvent("tick", fromMs + n * 250)),
  )

const changes = (keys: ReadonlyArray<string>): number =>
  Arr.reduce(Arr.zip(keys, Arr.drop(keys, 1)), 0, (n, [a, b]) => (a === b ? n : n + 1))

describe("Idle", () => {
  it("start enters the first item's work with a countdown from nowMs", () => {
    expect(started).toMatchObject({ _tag: "Working", round: 0, stepIndex: 0, startedAtMs: T0 })
    expect(remainingMs(started, T0)).toEqual(Option.some(30_000))
  })

  it("ignores every other event", () => {
    Arr.forEach(Arr.drop(ALL, 1), (tag) => {
      expect(step(config)(idle, playerEvent(tag, 5000))).toEqual(idle)
    })
  })
})

describe("Working and Resting by tick", () => {
  it("a full 2-item × 2-round day by ticks ends in Done with the planned duration", () => {
    const trace = tickTrace(started, T0)
    const end = Arr.lastNonEmpty([started, ...trace])
    expect(end).toEqual({ _tag: "Done", durationSeconds: 180 })
    expect(dayDurationSeconds(day)).toBe(180)
  })

  it("rests restSeconds after an item, restBetweenRoundsSeconds after a round, none at the end", () => {
    const afterFirst = runEvents([["tick", 31_000]], started)
    expect(afterFirst).toMatchObject({ _tag: "Resting", round: 0, stepIndex: 0, endsAtMs: 41_000 })
    const endOfRound = runEvents([["tick", 61_000]], started)
    expect(endOfRound).toMatchObject({ _tag: "Resting", round: 0, stepIndex: 1, endsAtMs: 121_000 })
    const lastWork = runEvents([["tick", 161_000]], started)
    expect(lastWork).toMatchObject({ _tag: "Working", round: 1, stepIndex: 1 })
    expect(runEvents([["tick", 181_000]], lastWork)._tag).toBe("Done")
  })

  it("one big tick after background lands on the right phase with the right remaining time", () => {
    const back = runEvents([["tick", 130_000]], started)
    expect(back).toMatchObject({ _tag: "Working", round: 1, stepIndex: 0, phaseStartMs: 121_000 })
    expect(remainingMs(back, 130_000)).toEqual(Option.some(21_000))
  })

  it("a big tick past the end is Done, timed to the last deadline rather than nowMs", () => {
    expect(runEvents([["tick", 999_000]], started)).toEqual({ _tag: "Done", durationSeconds: 180 })
  })

  it("a tick before the deadline changes nothing but the remaining time", () => {
    const later = runEvents([["tick", 11_000]], started)
    expect(later).toEqual(started)
    expect(remainingMs(later, 11_000)).toEqual(Option.some(20_000))
  })

  it("skips a rest of 0 s", () => {
    const noRest = Schema.decodeUnknownSync(ProgramDay)({
      ...day,
      items: [timed("plank", 30, 0), timed("side-plank", 20, 5)],
    })
    const s = runEvents([["tick", 31_000]], started, { day: noRest, speed: 1 })
    expect(s).toMatchObject({ _tag: "Working", round: 0, stepIndex: 1, phaseStartMs: 31_000 })
  })

  it("speed 10 divides every work and rest duration", () => {
    const fast: PlayerConfig = { day, speed: 10 }
    const s = runEvents([["start", 0]], idle, fast)
    expect(remainingMs(s, 0)).toEqual(Option.some(3000))
    expect(runEvents([["tick", 3000]], s, fast)).toMatchObject({ _tag: "Resting", endsAtMs: 4000 })
    expect(Arr.lastNonEmpty([s, ...tickTrace(s, 0, fast)])).toEqual({
      _tag: "Done",
      durationSeconds: 18,
    })
  })

  it("a reps item never auto-advances; only next does", () => {
    const repsDay = Schema.decodeUnknownSync(ProgramDay)({
      ...day,
      items: [{ kind: "reps", catalogId: "sit-up", reps: 12, restSeconds: 15 }],
    })
    const cfg: PlayerConfig = { day: repsDay, speed: 1 }
    const s = runEvents(
      [
        ["start", 0],
        ["tick", 10_000_000],
      ],
      idle,
      cfg,
    )
    expect(s).toMatchObject({ _tag: "Working", round: 0, stepIndex: 0, endsAtMs: Option.none() })
    expect(remainingMs(s, 10_000_000)).toEqual(Option.none())
    expect(runEvents([["next", 10_000_000]], s, cfg)).toMatchObject({
      _tag: "Resting",
      endsAtMs: 10_060_000,
    })
  })
})

describe("Working and Resting by command", () => {
  const resting = runEvents([["tick", 31_000]], started)

  it("start and resume are no-ops", () => {
    expect(runEvents([["start", 5000]], started)).toEqual(started)
    expect(runEvents([["resume", 5000]], started)).toEqual(started)
    expect(runEvents([["resume", 35_000]], resting)).toEqual(resting)
  })

  it("next ends work now (into its rest) and rest now (into the next item)", () => {
    expect(runEvents([["next", 5000]], started)).toMatchObject({
      _tag: "Resting",
      stepIndex: 0,
      endsAtMs: 15_000,
    })
    expect(runEvents([["next", 33_000]], resting)).toMatchObject({
      _tag: "Working",
      round: 0,
      stepIndex: 1,
      endsAtMs: Option.some(53_000),
    })
  })

  it("next on the final item is Done", () => {
    const lastWork = runEvents([["tick", 161_000]], started)
    expect(runEvents([["next", 170_000]], lastWork)).toEqual({ _tag: "Done", durationSeconds: 169 })
  })

  it("previous restarts the item after the first 2 s", () => {
    const secondItem = runEvents([["tick", 41_000]], started)
    expect(runEvents([["previous", 45_000]], secondItem)).toMatchObject({
      _tag: "Working",
      stepIndex: 1,
      phaseStartMs: 45_000,
      endsAtMs: Option.some(65_000),
    })
  })

  it("previous within the first 2 s goes to the item before, across rounds", () => {
    const secondItem = runEvents([["tick", 41_000]], started)
    expect(runEvents([["previous", 42_000]], secondItem)).toMatchObject({
      _tag: "Working",
      round: 0,
      stepIndex: 0,
      endsAtMs: Option.some(72_000),
    })
    const roundTwo = runEvents([["tick", 121_000]], started)
    expect(runEvents([["previous", 122_000]], roundTwo)).toMatchObject({
      _tag: "Working",
      round: 0,
      stepIndex: 1,
    })
  })

  it("previous on the very first item restarts it", () => {
    expect(runEvents([["previous", 1500]], started)).toMatchObject({
      _tag: "Working",
      round: 0,
      stepIndex: 0,
      phaseStartMs: 1500,
    })
  })

  it("previous while resting redoes the item just done", () => {
    expect(runEvents([["previous", 35_000]], resting)).toMatchObject({
      _tag: "Working",
      stepIndex: 0,
      endsAtMs: Option.some(65_000),
    })
  })

  it("finish is Done with the elapsed time", () => {
    expect(runEvents([["finish", 11_000]], started)).toEqual({ _tag: "Done", durationSeconds: 10 })
    expect(runEvents([["finish", 36_000]], resting)).toEqual({ _tag: "Done", durationSeconds: 35 })
  })
})

describe("Paused", () => {
  const paused = runEvents(
    [
      ["tick", 11_000],
      ["pause", 11_000],
    ],
    started,
  )

  it("pause freezes the remaining time and resume restores it", () => {
    expect(paused).toMatchObject({ _tag: "Paused", remainingMs: Option.some(20_000) })
    expect(remainingMs(paused, 90_000)).toEqual(Option.some(20_000))
    const resumed = runEvents([["resume", 100_000]], paused)
    expect(resumed).toMatchObject({ _tag: "Working", stepIndex: 0, pausedMs: 89_000 })
    expect(remainingMs(resumed, 100_000)).toEqual(Option.some(20_000))
  })

  it("duration excludes the paused time", () => {
    const end = runEvents(
      [
        ["resume", 100_000],
        ["finish", 120_000],
      ],
      paused,
    )
    expect(end).toEqual({ _tag: "Done", durationSeconds: 30 })
    expect(runEvents([["finish", 100_000]], paused)).toEqual({ _tag: "Done", durationSeconds: 10 })
  })

  it("pause between ticks first catches up to the running phase", () => {
    expect(runEvents([["pause", 35_000]], started)).toMatchObject({
      _tag: "Paused",
      inner: { _tag: "Resting", stepIndex: 0 },
      remainingMs: Option.some(6000),
    })
  })

  it("start, tick and pause are no-ops", () => {
    Arr.forEach(["start", "tick", "pause"] as const, (tag) => {
      expect(runEvents([[tag, 500_000]], paused)).toEqual(paused)
    })
  })

  it("next and previous move the phase and stay paused", () => {
    const skipped = runEvents([["next", 50_000]], paused)
    expect(skipped).toMatchObject({
      _tag: "Paused",
      inner: { _tag: "Resting", stepIndex: 0 },
      remainingMs: Option.some(10_000),
    })
    const restarted = runEvents([["previous", 50_000]], paused)
    expect(restarted).toMatchObject({ _tag: "Paused", remainingMs: Option.some(30_000) })
  })

  it("a paused reps item has no remaining time", () => {
    const repsDay = Schema.decodeUnknownSync(ProgramDay)({
      ...day,
      items: [{ kind: "reps", catalogId: "sit-up", reps: 12, restSeconds: 15 }],
    })
    const cfg: PlayerConfig = { day: repsDay, speed: 1 }
    const s = runEvents(
      [
        ["start", 0],
        ["pause", 1000],
        ["resume", 9000],
      ],
      idle,
      cfg,
    )
    expect(s).toMatchObject({ _tag: "Working", endsAtMs: Option.none(), pausedMs: 8000 })
  })
})

describe("Done", () => {
  it("ignores every event", () => {
    const end = runEvents([["finish", 11_000]], started)
    Arr.forEach(ALL, (tag) => {
      expect(step(config)(end, playerEvent(tag, 50_000))).toEqual(end)
    })
  })
})

describe("selectors", () => {
  it("currentItem, upNext and progress follow the phase", () => {
    const endOfRound = runEvents([["tick", 61_000]], started)
    expect(Option.map(currentItem(day, endOfRound), (i) => i.catalogId)).toEqual(
      Option.some("side-plank"),
    )
    expect(Option.map(upNext(day, endOfRound), (i) => i.catalogId)).toEqual(Option.some("plank"))
    expect(upNext(day, started)).toEqual(Option.none())
    expect(progress(day, endOfRound)).toEqual(
      Option.some({ round: 1, rounds: 2, item: 2, items: 2, set: 1, sets: 1, step: 2, steps: 2 }),
    )
  })

  it("are None in Idle and Done", () => {
    const end = runEvents([["finish", 2000]], started)
    Arr.forEach([idle, end], (s) => {
      expect(currentItem(day, s)).toEqual(Option.none())
      expect(progress(day, s)).toEqual(Option.none())
      expect(remainingMs(s, 2000)).toEqual(Option.none())
    })
  })
})

describe("phaseKey", () => {
  it("changes on each phase change and never on a plain tick", () => {
    const keys = Arr.map([idle, started, ...tickTrace(started, T0)], phaseKey)
    // idle → 7 phases → done: 8 changes across ~720 ticks
    expect(changes(keys)).toBe(8)
    expect(Arr.dedupeAdjacent(keys)).toHaveLength(9)
  })

  it("changes on restart, pause and resume", () => {
    const restarted = runEvents([["previous", 5000]], started)
    const paused = runEvents([["pause", 6000]], restarted)
    const resumed = runEvents([["resume", 7000]], paused)
    const keys = [phaseKey(started), phaseKey(restarted), phaseKey(paused), phaseKey(resumed)]
    expect(new Set(keys).size).toBe(4)
  })
})

describe("straight sets (programs-player-v2 §7.3)", () => {
  /** A gym day: bench 3 × 8 with 90 s between sets, then a 30 s plank; one round. */
  const gymDay = Schema.decodeUnknownSync(ProgramDay)({
    dayNumber: 1,
    title: "Day 1 · Push",
    rounds: 1,
    items: [
      { kind: "reps", catalogId: "barbell-bench-press", reps: 8, restSeconds: 90, sets: 3 },
      timed("plank", 30, 0),
    ],
    restBetweenRoundsSeconds: 0,
  })
  const gym: PlayerConfig = { day: gymDay, speed: 1 }
  const at = (state: PlayerState) =>
    Option.map(progress(gymDay, state), (p) => `${p.item}/${p.items}:${p.set}/${p.sets}`)

  it("stays on exercise 1 for sets 1 to 3, resting 90 s between them, then moves to exercise 2", () => {
    const s1 = runEvents([["start", 0]], idle, gym)
    const rest1 = runEvents([["next", 10_000]], s1, gym)
    const s2 = runEvents([["next", 20_000]], rest1, gym)
    const s3 = runEvents(
      [
        ["next", 30_000],
        ["next", 40_000],
      ],
      s2,
      gym,
    )
    const rest3 = runEvents([["next", 50_000]], s3, gym)
    const plank = runEvents([["next", 60_000]], rest3, gym)
    expect([s1, s2, s3, plank].map(at)).toEqual([
      Option.some("1/2:1/3"),
      Option.some("1/2:2/3"),
      Option.some("1/2:3/3"),
      Option.some("2/2:1/1"),
    ])
    expect(rest1).toMatchObject({ _tag: "Resting", stepIndex: 0, endsAtMs: 100_000 })
    expect(rest3).toMatchObject({ _tag: "Resting", stepIndex: 2, endsAtMs: 140_000 })
    expect(Option.map(currentItem(gymDay, plank), (i) => i.catalogId)).toEqual(Option.some("plank"))
  })

  it("plans the day as 3 × (16 s + 90 s rest) + 30 s", () => {
    expect(dayDurationSeconds(gymDay)).toBe(3 * 16 + 3 * 90 + 30)
  })
})
