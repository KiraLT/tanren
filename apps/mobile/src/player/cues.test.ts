import { describe, expect, it } from "@effect/vitest"
import { CatalogId, DayNumber, ProgramDay } from "@tanren/shared"
import { Array as Arr, Option, Schema } from "effect"
import {
  alertFor,
  clock,
  countdownCue,
  cueFor,
  exerciseName,
  initialRun,
  initialRunFrom,
  itemAmount,
  nextCaption,
  type PlayerRun,
  parseSpeed,
  prefillFor,
  type RunConfig,
  type RunEvent,
  reduceRun,
  repsOf,
  snapshotOf,
} from "./cues"
import { type PlayerEventTag, PREVIOUS_GRACE_MS, playerEvent } from "./playerMachine"

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
const NO_PREFILL: RunConfig["prefill"] = new Map()
const config: RunConfig = { day, speed: 1, prefill: NO_PREFILL, ids: [] }
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
      reduceRun({ day: three, speed: 1, prefill: NO_PREFILL, ids: [] })(
        state,
        playerEvent(tag, nowMs),
      ),
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
    const fast: RunConfig = { day, speed: 10, prefill: NO_PREFILL, ids: [] }
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

describe("nextCaption", () => {
  const caption = (events: ReadonlyArray<readonly [PlayerEventTag, number]>) =>
    nextCaption(day, run(events).player)
  it("names the following item and its amount on a work screen", () => {
    expect(caption([["start", T0]])).toEqual(Option.some("Next · Zz Other Move 20 s"))
  })
  it("stays on the work screen while paused", () => {
    expect(
      caption([
        ["start", T0],
        ["pause", 5000],
      ]),
    ).toEqual(Option.some("Next · Zz Other Move 20 s"))
  })
  it("wraps to the first item for the next round", () => {
    expect(
      caption([
        ["start", T0],
        ["tick", 45_000],
      ]),
    ).toEqual(Option.some("Next · Zz Test Move 30 s"))
  })
  it("is none on the last item of the last round, while resting, idle and done", () => {
    expect(
      caption([
        ["start", T0],
        ["tick", 170_000],
      ]),
    ).toEqual(Option.none())
    expect(
      caption([
        ["start", T0],
        ["tick", 32_000],
      ]),
    ).toEqual(Option.none())
    expect(caption([])).toEqual(Option.none())
    expect(
      caption([
        ["start", T0],
        ["tick", 300_000],
      ]),
    ).toEqual(Option.none())
  })
  it("spells a reps item as reps", () => {
    const repsDay = Schema.decodeUnknownSync(ProgramDay)({
      dayNumber: 1,
      title: "Day 1",
      rounds: 1,
      restBetweenRoundsSeconds: 0,
      items: [
        { kind: "timed", catalogId: "zz-a", seconds: 10, restSeconds: 5 },
        { kind: "reps", catalogId: "zz-b", reps: 12, restSeconds: 5 },
      ],
    })
    const started = reduceRun({ day: repsDay, speed: 1, prefill: NO_PREFILL, ids: [] })(
      initialRun(0),
      playerEvent("start", T0),
    )
    expect(nextCaption(repsDay, started.player)).toEqual(Option.some("Next · Zz B 12 reps"))
  })
})

describe("reps items (ADR-0020)", () => {
  const repsItem = { kind: "reps", catalogId: "zz-reps-move", reps: 12, restSeconds: 15 }
  const timedItem = { kind: "timed", catalogId: "zz-timed-move", seconds: 25, restSeconds: 60 }
  const mixed = Schema.decodeUnknownSync(ProgramDay)({
    dayNumber: 1,
    title: "Day 1 · Mixed",
    rounds: 1,
    restBetweenRoundsSeconds: 0,
    items: [repsItem, timedItem],
  })
  const mixedConfig: RunConfig = { day: mixed, speed: 1, prefill: NO_PREFILL, ids: [] }
  const mixedRun = (events: ReadonlyArray<readonly [PlayerEventTag, number]>): PlayerRun =>
    Arr.reduce(events, initialRun(0), (state, [tag, nowMs]) =>
      reduceRun(mixedConfig)(state, playerEvent(tag, nowMs)),
    )
  const [first, second] = mixed.items

  it("repsOf is Some(count) for a reps item and None for a timed one", () => {
    expect(first === undefined ? Option.none() : repsOf(first)).toEqual(Option.some(12))
    expect(second === undefined ? Option.some(-1) : repsOf(second)).toEqual(Option.none())
  })

  it("itemAmount spells a reps item as '12 reps' and a timed one as '25 s'", () => {
    expect(first === undefined ? "" : itemAmount(first)).toBe("12 reps")
    expect(second === undefined ? "" : itemAmount(second)).toBe("25 s")
  })

  it("alertFor is None on the reps work phase", () => {
    expect(alertFor(mixedConfig, mixedRun([["start", T0]]).player)).toEqual(Option.none())
  })

  it("alertFor is None on the reps work phase after a long tick and while paused", () => {
    expect(
      alertFor(
        mixedConfig,
        mixedRun([
          ["start", T0],
          ["tick", T0 + 600_000],
        ]).player,
      ),
    ).toEqual(Option.none())
    expect(
      alertFor(
        mixedConfig,
        mixedRun([
          ["start", T0],
          ["pause", T0 + 100],
        ]).player,
      ),
    ).toEqual(Option.none())
  })

  it("once resting, alertFor names the next item and its amount at the rest deadline", () => {
    const resting = mixedRun([
      ["start", T0],
      ["next", T0 + 5_000],
    ])
    expect(resting.player._tag).toBe("Resting")
    expect(alertFor(mixedConfig, resting.player)).toEqual(
      Option.some({ atMs: T0 + 5_000 + 15_000, text: "Rest over — Zz Timed Move, 25 s" }),
    )
  })

  it("nextCaption from the reps phase previews the timed item", () => {
    expect(nextCaption(mixed, mixedRun([["start", T0]]).player)).toEqual(
      Option.some("Next · Zz Timed Move 25 s"),
    )
  })

  it("cueFor from Idle into the reps Working phase is 'work'", () => {
    const started = mixedRun([["start", T0]])
    expect(started.previous._tag).toBe("Idle")
    expect(started.player).toMatchObject({ _tag: "Working", endsAtMs: Option.none() })
    expect(cueFor(started.previous, started.player)).toBe("work")
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

describe("weights (programs-player-v2 §2.2)", () => {
  const BENCH = CatalogId.make("barbell-bench-press")
  /** Bench 8 reps (weighted: barbell) then a 30 s plank, 2 rounds. */
  const push = Schema.decodeUnknownSync(ProgramDay)({
    dayNumber: 1,
    title: "Day 1 · Push",
    rounds: 2,
    restBetweenRoundsSeconds: 30,
    items: [
      { kind: "reps", catalogId: "barbell-bench-press", reps: 8, restSeconds: 60 },
      { kind: "timed", catalogId: "plank", seconds: 30, restSeconds: 15 },
    ],
  })
  const pushConfig: RunConfig = {
    day: push,
    speed: 1,
    prefill: new Map([[BENCH, { weightKg: 60, reps: 5 }]]),
    ids: [],
  }
  const reduce = reduceRun(pushConfig)
  const started = reduce(initialRun(0), playerEvent("start", T0))

  it("prefills a weighted item with the last load and the item's rep target", () => {
    expect(started.draft).toEqual(Option.some({ weightKg: 60, reps: 8 }))
  })

  it("prefills 0 kg × target without history, and nothing for a timed item", () => {
    const bare: RunConfig = { ...pushConfig, prefill: NO_PREFILL, ids: [] }
    expect(prefillFor(bare, [], 0)).toEqual(Option.some({ weightKg: 0, reps: 8 }))
    expect(prefillFor(bare, [], 1)).toEqual(Option.none())
  })

  it("keeps entries.length === performedItems after start → next × 3", () => {
    const steps = Arr.reduce(
      [5_000, 6_000, 7_000],
      [started],
      (runs: ReadonlyArray<PlayerRun>, nowMs): ReadonlyArray<PlayerRun> => [
        ...runs,
        reduce(runs[runs.length - 1] ?? started, playerEvent("next", nowMs)),
      ],
    )
    expect(steps.map((r) => [r.entries.length, r.performedItems])).toEqual(
      steps.map((r) => [r.performedItems, r.performedItems]),
    )
    expect(steps.at(-1)?.entries).toEqual([Option.some({ weightKg: 60, reps: 8 }), Option.none()])
  })

  it("adjust only changes draft, and next logs the adjusted value", () => {
    const adjusted = reduce(started, { _tag: "adjust", weightKg: 20, reps: 10 })
    expect({ ...adjusted, draft: started.draft }).toEqual(started)
    expect(adjusted.draft).toEqual(Option.some({ weightKg: 20, reps: 10 }))
    expect(reduce(adjusted, playerEvent("next", 5_000)).entries).toEqual([
      Option.some({ weightKg: 20, reps: 10 }),
    ])
  })

  it("a later round of the same exercise starts from this run's entry", () => {
    const adjusted = reduce(started, { _tag: "adjust", weightKg: 20, reps: 10 })
    const round2 = Arr.reduce([5_000, 6_000, 7_000, 8_000], adjusted, (r, nowMs) =>
      reduce(r, playerEvent("next", nowMs)),
    )
    expect(round2.player._tag).toBe("Working")
    expect(round2.draft).toEqual(Option.some({ weightKg: 20, reps: 10 }))
  })

  it("previous within the grace drops the last entry and restores it as the draft", () => {
    const adjusted = reduce(started, { _tag: "adjust", weightKg: 20, reps: 10 })
    const onPlank = Arr.reduce([5_000, 6_000], adjusted, (r, nowMs) =>
      reduce(r, playerEvent("next", nowMs)),
    )
    expect(onPlank.entries).toHaveLength(1)
    const back = reduce(onPlank, playerEvent("previous", 6_000 + PREVIOUS_GRACE_MS - 1))
    expect(back.entries).toEqual([])
    expect(back.performedItems).toBe(0)
    expect(back.draft).toEqual(Option.some({ weightKg: 20, reps: 10 }))
  })
})

describe("weights across a mid-run swap (PROG-R)", () => {
  const BENCH = CatalogId.make("barbell-bench-press")
  const PLANK = CatalogId.make("plank")
  const push = Schema.decodeUnknownSync(ProgramDay)({
    dayNumber: 1,
    title: "Day 1 · Push",
    rounds: 2,
    restBetweenRoundsSeconds: 30,
    items: [
      { kind: "reps", catalogId: "barbell-bench-press", reps: 8, restSeconds: 60 },
      { kind: "timed", catalogId: "plank", seconds: 30, restSeconds: 15 },
    ],
  })
  const plan = [BENCH, PLANK, BENCH, PLANK]
  const base: RunConfig = {
    day: push,
    speed: 1,
    prefill: new Map([[BENCH, { weightKg: 60, reps: 5 }]]),
    ids: plan,
  }
  const adjusted = reduceRun(base)(reduceRun(base)(initialRun(0), playerEvent("start", T0)), {
    _tag: "adjust",
    weightKg: 80,
    reps: 8,
  })

  it("a swap to a bodyweight exercise while working drops the draft and logs None", () => {
    const swapped: RunConfig = { ...base, ids: [CatalogId.make("push-up"), PLANK, BENCH, PLANK] }
    const replanned = reduceRun(swapped)(adjusted, { _tag: "replan", previousIds: plan })
    expect(replanned.draft).toEqual(Option.none())
    expect(reduceRun(swapped)(replanned, playerEvent("next", 5_000)).entries).toEqual([
      Option.none(),
    ])
  })

  it("a loaded replacement in round 2 does not inherit round 1's bench entry", () => {
    const swapped: RunConfig = {
      ...base,
      ids: [BENCH, PLANK, CatalogId.make("dumbbell-bench-press"), PLANK],
    }
    const round2 = Arr.reduce([5_000, 6_000, 7_000, 8_000], adjusted, (r, nowMs) =>
      reduceRun(swapped)(r, playerEvent("next", nowMs)),
    )
    expect(round2.entries[0]).toEqual(Option.some({ weightKg: 80, reps: 8 }))
    expect(round2.draft).toEqual(Option.some({ weightKg: 0, reps: 8 }))
  })

  it("adjust, previous, next: the undone round falls back to its draft, then logs it", () => {
    const onPlank = Arr.reduce([5_000, 6_000], adjusted, (r, nowMs) =>
      reduceRun(base)(r, playerEvent("next", nowMs)),
    )
    const back = reduceRun(base)(onPlank, playerEvent("previous", 6_500))
    const again = reduceRun(base)(back, playerEvent("next", 7_000))
    expect(again.entries).toEqual([Option.some({ weightKg: 80, reps: 8 })])
  })

  it("a replan that keeps the working round's exercise keeps the adjusted draft", () => {
    const later: RunConfig = {
      ...base,
      ids: [BENCH, PLANK, CatalogId.make("dumbbell-bench-press"), PLANK],
    }
    const replanned = reduceRun(later)(adjusted, { _tag: "replan", previousIds: plan })
    expect(replanned.draft).toEqual(Option.some({ weightKg: 80, reps: 8 }))
  })
})

describe("weights across straight sets (programs-player-v2 §7.3)", () => {
  const BENCH = CatalogId.make("barbell-bench-press")
  const gym = Schema.decodeUnknownSync(ProgramDay)({
    dayNumber: 1,
    title: "Day 1 · Push",
    rounds: 1,
    restBetweenRoundsSeconds: 0,
    items: [
      { kind: "reps", catalogId: "barbell-bench-press", reps: 10, restSeconds: 120, sets: 3 },
      { kind: "timed", catalogId: "plank", seconds: 30, restSeconds: 0 },
    ],
  })
  const config: RunConfig = {
    day: gym,
    speed: 1,
    prefill: new Map([[BENCH, { weightKg: 60, reps: 8 }]]),
    ids: [BENCH, BENCH, BENCH, CatalogId.make("plank")],
  }
  const reduce = reduceRun(config)
  const set1 = reduce(reduce(initialRun(0), playerEvent("start", T0)), {
    _tag: "adjust",
    weightKg: 70,
    reps: 10,
  })

  it("set 2 starts from set 1's weight, and every set appends one entry", () => {
    const set2 = Arr.reduce([5_000, 6_000], set1, (r, nowMs) =>
      reduce(r, playerEvent("next", nowMs)),
    )
    expect(set2.draft).toEqual(Option.some({ weightKg: 70, reps: 10 }))
    const done = Arr.reduce([7_000, 8_000, 9_000, 10_000, 11_000], set2, (r, nowMs) =>
      reduce(r, playerEvent("next", nowMs)),
    )
    expect(done.player._tag).toBe("Done")
    expect(done.performedItems).toBe(4)
    expect(done.entries).toEqual([
      Option.some({ weightKg: 70, reps: 10 }),
      Option.some({ weightKg: 70, reps: 10 }),
      Option.some({ weightKg: 70, reps: 10 }),
      Option.none(),
    ])
  })
})

describe("nextCaption across straight sets", () => {
  const gym = Schema.decodeUnknownSync(ProgramDay)({
    dayNumber: 1,
    title: "Day 1 · Push",
    rounds: 1,
    restBetweenRoundsSeconds: 0,
    items: [
      { kind: "reps", catalogId: "barbell-bench-press", reps: 10, restSeconds: 0, sets: 4 },
      { kind: "timed", catalogId: "plank", seconds: 30, restSeconds: 0 },
    ],
  })
  const reduce = reduceRun({ day: gym, speed: 1, prefill: NO_PREFILL, ids: [] })
  const at = (nexts: number) =>
    Arr.reduce(Arr.range(1, nexts), reduce(initialRun(0), playerEvent("start", T0)), (r, n) =>
      reduce(r, playerEvent("next", T0 + n * 1000)),
    )

  it("names the next set of the same exercise, then the next exercise after the last set", () => {
    expect(nextCaption(gym, at(1).player)).toEqual(Option.some("Next · Set 3/4"))
    expect(nextCaption(gym, at(3).player)).toEqual(
      Option.some(`Next · ${exerciseName(CatalogId.make("plank"))} 30 s`),
    )
  })
})

describe("snapshotOf / initialRunFrom (PROG-2)", () => {
  /** Bench 8 reps (weighted) then a 30 s plank, 2 rounds. */
  const push = Schema.decodeUnknownSync(ProgramDay)({
    dayNumber: 1,
    title: "Day 1 · Push",
    rounds: 2,
    restBetweenRoundsSeconds: 30,
    items: [
      { kind: "reps", catalogId: "barbell-bench-press", reps: 8, restSeconds: 60 },
      { kind: "timed", catalogId: "plank", seconds: 30, restSeconds: 15 },
    ],
  })
  const pushConfig: RunConfig = { day: push, speed: 1, prefill: NO_PREFILL, ids: [] }
  const at = { dayNumber: DayNumber.make(1), ids: [] }
  const events: ReadonlyArray<RunEvent> = [
    playerEvent("start", T0),
    { _tag: "adjust", weightKg: 62.5, reps: 8 },
    playerEvent("next", 5_000),
    playerEvent("next", 6_000),
    playerEvent("next", 7_000),
    playerEvent("next", 8_000),
    { _tag: "adjust", weightKg: 65, reps: 6 },
    playerEvent("pause", 9_000),
  ]
  const paused = Arr.reduce(events, initialRun(0), (state, event) =>
    reduceRun(pushConfig)(state, event),
  )

  it("is None on Idle and Done", () => {
    expect(snapshotOf(initialRun(0), at, T0)).toEqual(Option.none())
    const done = reduceRun(pushConfig)(paused, playerEvent("finish", 10_000))
    expect(done.player._tag).toBe("Done")
    expect(snapshotOf(done, at, 10_000)).toEqual(Option.none())
  })

  it("restores the step, the performed sets with their weights and the draft", () => {
    expect(paused.player._tag).toBe("Paused")
    const restored = Option.flatMap(snapshotOf(paused, at, 9_000), (saved) =>
      initialRunFrom(pushConfig, saved, 600_000),
    )
    expect(Option.map(restored, (r) => r.performedItems)).toEqual(Option.some(2))
    expect(Option.map(restored, (r) => r.entries)).toEqual(
      Option.some([Option.some({ weightKg: 62.5, reps: 8 }), Option.none()]),
    )
    expect(Option.map(restored, (r) => r.draft)).toEqual(
      Option.some(Option.some({ weightKg: 65, reps: 6 })),
    )
    expect(
      Option.map(restored, (r) =>
        r.player._tag === "Paused" ? [r.player.inner.round, r.player.inner.stepIndex] : [],
      ),
    ).toEqual(Option.some([1, 0]))
  })
})
