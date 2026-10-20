import { describe, expect, it } from "@effect/vitest"
import { CatalogId, ProgramDay } from "@tanren/shared"
import { Array as Arr, Option, Schema } from "effect"
import {
  alertFor,
  clock,
  countdownCue,
  cueFor,
  exerciseName,
  initialRun,
  type PlayerRun,
  parseSpeed,
  reduceRun,
} from "./cues"
import { type PlayerConfig, type PlayerEventTag, playerEvent } from "./playerMachine"

/** 2 items × 2 rounds from T0 = 1 000: W(0,0) –31 000 · R –41 000 · W(0,1) –61 000 · round rest
 * –121 000 · W(1,0) –151 000 · R –161 000 · W(1,1) –181 000 · Done. */
const day = Schema.decodeUnknownSync(ProgramDay)({
  dayNumber: 1,
  title: "Day 1 · Foundation",
  rounds: 2,
  restBetweenRoundsSeconds: 60,
  items: [
    { kind: "timed", catalogId: "zz-test-move", seconds: 30, restSeconds: 10 },
    { kind: "timed", catalogId: "zz-other-move", seconds: 20, restSeconds: 60 },
  ],
})
const config: PlayerConfig = { day, speed: 1 }
const T0 = 1000

const run = (events: ReadonlyArray<readonly [PlayerEventTag, number]>): PlayerRun =>
  Arr.reduce(events, initialRun(0), (state, [tag, nowMs]) =>
    reduceRun(config)(state, playerEvent(tag, nowMs)),
  )

describe("reduceRun", () => {
  it("keeps the previous state and the start time", () => {
    const started = run([["start", T0]])
    expect(started.player._tag).toBe("Working")
    expect(started.previous._tag).toBe("Idle")
    expect(started.startedAtMs).toEqual(Option.some(T0))
    const later = run([
      ["start", T0],
      ["tick", 32_000],
    ])
    expect(later.player._tag).toBe("Resting")
    expect(later.previous._tag).toBe("Working")
    expect(later.previousNowMs).toBe(T0)
    expect(later.startedAtMs).toEqual(Option.some(T0))
  })
})

describe("performedItems", () => {
  /** 3 items × 2 rounds from T0 = 1 000: W(0,0) –11 000 · R –16 000 · W(0,1) –26 000 · R –31 000 ·
   * W(0,2) –41 000 · round rest –61 000 · round 2 … · Done at 136 000. */
  const three = Schema.decodeUnknownSync(ProgramDay)({
    dayNumber: 1,
    title: "Day 1 · Foundation",
    rounds: 2,
    restBetweenRoundsSeconds: 20,
    items: [
      { kind: "timed", catalogId: "zz-a", seconds: 10, restSeconds: 5 },
      { kind: "timed", catalogId: "zz-b", seconds: 10, restSeconds: 5 },
      { kind: "timed", catalogId: "zz-c", seconds: 10, restSeconds: 5 },
    ],
  })
  const performed = (events: ReadonlyArray<readonly [PlayerEventTag, number]>) =>
    Arr.reduce(events, initialRun(0), (state, [tag, nowMs]) =>
      reduceRun({ day: three, speed: 1 })(state, playerEvent(tag, nowMs)),
    )
  it("finish while working on round 1 item 3 counts the 2 items before it", () => {
    const r = performed([
      ["start", T0],
      ["tick", 35_000],
      ["finish", 35_000],
    ])
    expect(r.player._tag).toBe("Done")
    expect(r.performedItems).toBe(2)
  })
  it("finish during the rest after item 3 counts it", () => {
    const r = performed([
      ["start", T0],
      ["tick", 45_000],
      ["finish", 45_000],
    ])
    expect(r.performedItems).toBe(3)
  })
  it("finish while paused counts the paused phase", () => {
    const r = performed([
      ["start", T0],
      ["tick", 18_000],
      ["pause", 18_000],
      ["finish", 20_000],
    ])
    expect(r.performedItems).toBe(1)
  })
  it("a natural end counts rounds × items and stays frozen after Done", () => {
    const r = performed([
      ["start", T0],
      ["tick", 200_000],
      ["tick", 300_000],
    ])
    expect(r.player._tag).toBe("Done")
    expect(r.performedItems).toBe(6)
  })
})

describe("cueFor", () => {
  const cue = (events: ReadonlyArray<readonly [PlayerEventTag, number]>) => {
    const r = run(events)
    return cueFor(r.previous, r.player)
  }
  it("work → rest is the rest cue, rest → work the work cue", () => {
    expect(cue([["start", T0]])).toBe("work")
    expect(
      cue([
        ["start", T0],
        ["tick", 31_000],
      ]),
    ).toBe("rest")
    expect(
      cue([
        ["start", T0],
        ["tick", 31_000],
        ["tick", 41_000],
      ]),
    ).toBe("work")
  })
  it("a plain tick, pause and resume are silent", () => {
    expect(
      cue([
        ["start", T0],
        ["tick", 2000],
      ]),
    ).toBe("none")
    expect(
      cue([
        ["start", T0],
        ["pause", 5000],
      ]),
    ).toBe("none")
    expect(
      cue([
        ["start", T0],
        ["pause", 5000],
        ["resume", 9000],
      ]),
    ).toBe("none")
  })
  it("finish is the done cue", () => {
    expect(
      cue([
        ["start", T0],
        ["finish", 5000],
      ]),
    ).toBe("done")
  })
})

describe("countdownCue", () => {
  // R(0,0) runs 31 000–41 000, then work starts: the run-up to work is 38 000–41 000.
  const at = (nowMs: number, previousMs: number) =>
    countdownCue(
      run([
        ["start", T0],
        ["tick", previousMs],
        ["tick", nowMs],
      ]),
    )
  it("fires on 3, 2, 1 seconds left in a rest, before the next work, once each", () => {
    expect(at(38_250, 37_750)).toEqual(Option.some(3))
    expect(at(38_500, 38_250)).toEqual(Option.none())
    expect(at(39_250, 38_750)).toEqual(Option.some(2))
    expect(at(40_250, 39_750)).toEqual(Option.some(1))
    expect(at(35_250, 34_750)).toEqual(Option.none())
  })
  it("never fires at the end of a work phase", () => {
    expect(at(28_250, 27_750)).toEqual(Option.none())
    expect(at(30_250, 29_750)).toEqual(Option.none())
  })
})

describe("alertFor", () => {
  it("work phase: at its deadline, names the item and the rest", () => {
    const alert = alertFor(config, run([["start", T0]]).player)
    expect(alert).toEqual(Option.some({ atMs: 31_000, text: "Zz Test Move done — rest 10 s" }))
  })
  it("rest phase: 'Rest over — <next>, <n> s'", () => {
    const r = run([
      ["start", T0],
      ["tick", 32_000],
    ])
    expect(alertFor(config, r.player)).toEqual(
      Option.some({ atMs: 41_000, text: "Rest over — Zz Other Move, 20 s" }),
    )
  })
  it("rest between rounds uses the round rest; the final phase completes", () => {
    const roundRest = run([
      ["start", T0],
      ["tick", 41_000],
    ])
    expect(alertFor(config, roundRest.player)).toEqual(
      Option.some({ atMs: 61_000, text: "Zz Other Move done — rest 60 s" }),
    )
    const last = run([
      ["start", T0],
      ["tick", 161_000],
    ])
    expect(alertFor(config, last.player)).toEqual(
      Option.some({ atMs: 181_000, text: "Workout complete" }),
    )
  })
  it("scales the deadline by speed but keeps planned seconds in the text", () => {
    const fast: PlayerConfig = { day, speed: 10 }
    const started = reduceRun(fast)(initialRun(0), playerEvent("start", T0))
    expect(alertFor(fast, started.player)).toEqual(
      Option.some({ atMs: 4000, text: "Zz Test Move done — rest 10 s" }),
    )
  })
  it("none while paused or idle", () => {
    expect(alertFor(config, initialRun(0).player)).toEqual(Option.none())
    const paused = run([
      ["start", T0],
      ["pause", 2000],
    ])
    expect(alertFor(config, paused.player)).toEqual(Option.none())
  })
})

describe("helpers", () => {
  it("parseSpeed accepts numbers ≥ 1 only", () => {
    expect(parseSpeed(undefined)).toBe(1)
    expect(parseSpeed("10")).toBe(10)
    expect(parseSpeed("0.5")).toBe(1)
    expect(parseSpeed("fast")).toBe(1)
  })
  it("exerciseName falls back to a title-cased id", () => {
    expect(exerciseName(CatalogId.make("zz-test-move"))).toBe("Zz Test Move")
  })
  it("clock formats m:ss", () => {
    expect(clock(0)).toBe("0:00")
    expect(clock(65)).toBe("1:05")
    expect(clock(915)).toBe("15:15")
  })
})
