import { describe, expect, it } from "@effect/vitest"
import { ProgramDay } from "@tanren/shared"
import { Option, Schema } from "effect"
import {
  idle,
  type PlayerConfig,
  type PlayerEventTag,
  type PlayerState,
  phaseKey,
  playerEvent,
  remainingMs,
  step,
} from "./playerMachine"

const timed = (catalogId: string, seconds: number, restSeconds: number) => ({
  kind: "timed",
  catalogId,
  seconds,
  restSeconds,
})

/** Same timeline as playerMachine.test.ts: start T0=1000; Done at 181 000 (speed 1). */
const day = Schema.decodeUnknownSync(ProgramDay)({
  dayNumber: 1,
  title: "Day 1 · Edge",
  rounds: 2,
  items: [timed("plank", 30, 10), timed("side-plank", 20, 5)],
  restBetweenRoundsSeconds: 60,
})
const repsDay = Schema.decodeUnknownSync(ProgramDay)({
  dayNumber: 1,
  title: "Day 1 · Reps",
  rounds: 1,
  items: [{ kind: "reps", catalogId: "squat", reps: 10, restSeconds: 0 }, timed("plank", 10, 0)],
  restBetweenRoundsSeconds: 0,
})
const T0 = 1000
const cfg = (speed = 1, d: ProgramDay = day): PlayerConfig => ({ day: d, speed })
type Ev = readonly [PlayerEventTag, number]
const run = (events: ReadonlyArray<Ev>, c: PlayerConfig = cfg(), from: PlayerState = idle) =>
  events.reduce((s, [t, n]) => step(c)(s, playerEvent(t, n)), from)

describe("playerMachine phase boundaries", () => {
  it("a tick exactly at endsAt enters the next phase (deadline is inclusive)", () => {
    const s = run([
      ["start", T0],
      ["tick", T0 + 30_000],
    ])
    expect(s).toMatchObject({ _tag: "Resting", round: 0, itemIndex: 0, phaseStartMs: T0 + 30_000 })
  })

  it("a tick one ms before endsAt stays in the phase", () => {
    expect(
      run([
        ["start", T0],
        ["tick", T0 + 29_999],
      ]),
    ).toMatchObject({ _tag: "Working", itemIndex: 0 })
  })

  it("a single tick after a long background gap lands in the right phase with deadlines chained", () => {
    // 100 s in: W0 30, R 10, W1 20 (ends 60), between-rounds rest 60 (ends 120) -> still resting.
    const s = run([
      ["start", T0],
      ["tick", T0 + 100_000],
    ])
    expect(s).toMatchObject({ _tag: "Resting", round: 0, itemIndex: 1, endsAtMs: T0 + 120_000 })
    // 125 s in: inside W(1,0) which began exactly at the deadline 121 000 - 1000? (T0+120_000).
    const t = run([
      ["start", T0],
      ["tick", T0 + 125_000],
    ])
    expect(t).toMatchObject({ _tag: "Working", round: 1, itemIndex: 0, phaseStartMs: T0 + 120_000 })
  })

  it("a gap past the end is Done with duration of the schedule, not of the gap", () => {
    const s = run([
      ["start", T0],
      ["tick", T0 + 10_000_000],
    ])
    expect(s).toEqual({ _tag: "Done", durationSeconds: 180 })
  })

  it("zero-length gap and repeated ticks at one instant are idempotent", () => {
    const a = run([
      ["start", T0],
      ["tick", T0 + 31_000],
    ])
    expect(
      run(
        [
          ["tick", T0 + 31_000],
          ["tick", T0 + 31_000],
        ],
        cfg(),
        a,
      ),
    ).toEqual(a)
  })

  it("a tick with a clock that went backwards changes nothing", () => {
    const a = run([["start", T0]])
    expect(step(cfg())(a, playerEvent("tick", T0 - 5000))).toEqual(a)
  })

  it("pause after the deadline but before any tick freezes the phase that is really running", () => {
    const s = run([
      ["start", T0],
      ["pause", T0 + 35_000],
    ])
    expect(s).toMatchObject({ _tag: "Paused", inner: { _tag: "Resting", itemIndex: 0 } })
    expect(remainingMs(s, T0 + 99_999)).toEqual(Option.some(5000))
  })

  it("pause then resume across what would have been a boundary does not skip the phase", () => {
    const s = run([
      ["start", T0],
      ["pause", T0 + 29_000],
      ["resume", T0 + 500_000],
      ["tick", T0 + 500_500],
    ])
    expect(s).toMatchObject({ _tag: "Working", itemIndex: 0 })
    expect(remainingMs(s, T0 + 500_500)).toEqual(Option.some(500))
  })

  it("pausedMs is excluded from Done duration", () => {
    const s = run([
      ["start", T0],
      ["pause", T0 + 10_000],
      ["resume", T0 + 70_000],
      ["tick", T0 + 70_000 + 170_000 + 1000],
    ])
    expect(s).toEqual({ _tag: "Done", durationSeconds: 180 })
  })

  it("finish while paused ends at the resume instant without counting the pause", () => {
    const s = run([
      ["start", T0],
      ["pause", T0 + 10_000],
      ["finish", T0 + 50_000],
    ])
    expect(s).toEqual({ _tag: "Done", durationSeconds: 10 })
  })

  it("phaseKey does not change on a plain tick but changes at a boundary tick", () => {
    const a = run([["start", T0]])
    expect(phaseKey(step(cfg())(a, playerEvent("tick", T0 + 10)))).toBe(phaseKey(a))
    expect(phaseKey(step(cfg())(a, playerEvent("tick", T0 + 30_000)))).not.toBe(phaseKey(a))
  })

  it("Done ignores every event", () => {
    const d: PlayerState = { _tag: "Done", durationSeconds: 5 }
    const tags: ReadonlyArray<PlayerEventTag> = [
      "start",
      "tick",
      "pause",
      "resume",
      "next",
      "previous",
      "finish",
    ]
    tags.forEach((tag) => {
      expect(step(cfg())(d, playerEvent(tag, 1))).toEqual(d)
    })
  })
})

describe("playerMachine speed", () => {
  it("speed 10 divides every phase; Done duration is real elapsed", () => {
    const s = run(
      [
        ["start", T0],
        ["tick", T0 + 18_000],
      ],
      cfg(10),
    )
    expect(s).toEqual({ _tag: "Done", durationSeconds: 18 })
  })

  it("a fractional speed below 1 and speed 0 behave as speed 1 (never divide by zero)", () => {
    ;[0, 0.5, -3].forEach((speed) => {
      const s = run([["start", T0]], cfg(speed))
      expect(s).toMatchObject({ _tag: "Working", endsAtMs: Option.some(T0 + 30_000) })
    })
  })

  // DEFECT: scaledMs uses Math.max(1, speed) which is NaN for NaN speed, so deadlines become NaN and the phase never ends (playerMachine.ts scaledMs)
  it.fails("speed NaN does not produce a NaN deadline", () => {
    const s = run([["start", T0]], cfg(Number.NaN))
    expect(s._tag === "Working" && Option.getOrElse(s.endsAtMs, () => Number.NaN)).not.toBeNaN()
  })

  it("speed 10 with a huge gap skips every phase in one tick without recursing forever", () => {
    expect(
      run(
        [
          ["start", T0],
          ["tick", T0 + 99_999_999],
        ],
        cfg(10),
      ),
    ).toMatchObject({ _tag: "Done" })
  })
})

describe("playerMachine reps items and rest 0", () => {
  it("a reps item has no deadline: ticks never advance it, next does; rest 0 is skipped", () => {
    const c = cfg(1, repsDay)
    const a = run(
      [
        ["start", T0],
        ["tick", T0 + 9_999_999],
      ],
      c,
    )
    expect(a).toMatchObject({ _tag: "Working", itemIndex: 0, endsAtMs: Option.none() })
    const b = step(c)(a, playerEvent("next", T0 + 10_000_000))
    expect(b).toMatchObject({ _tag: "Working", itemIndex: 1 })
    expect(run([["tick", T0 + 10_020_000]], c, b)).toEqual({
      _tag: "Done",
      durationSeconds: 10_010,
    })
  })

  it("pausing a reps item then resuming keeps it without a deadline", () => {
    const c = cfg(1, repsDay)
    const s = run(
      [
        ["start", T0],
        ["pause", T0 + 100],
        ["resume", T0 + 900],
      ],
      c,
    )
    expect(s).toMatchObject({ _tag: "Working", endsAtMs: Option.none() })
  })

  it("previous on the very first item restarts it, never goes negative", () => {
    const s = run([
      ["start", T0],
      ["previous", T0 + 100],
    ])
    expect(s).toMatchObject({ _tag: "Working", round: 0, itemIndex: 0, phaseStartMs: T0 + 100 })
  })
})
