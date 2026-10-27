import { describe, expect, it } from "@effect/vitest"
import { ProgramDay } from "@tanren/shared"
import { Option, Schema } from "effect"
import { initialPlan, mergeDay, reconcilePlan } from "./mergeDay"
import type { PlayerState } from "./playerMachine"

const running = Schema.decodeUnknownSync(ProgramDay)({
  dayNumber: 3,
  title: "Day 3 · Build",
  rounds: 2,
  restBetweenRoundsSeconds: 60,
  items: [
    { kind: "timed", catalogId: "plank", seconds: 30, restSeconds: 10 },
    { kind: "reps", catalogId: "crunch", reps: 15, restSeconds: 20 },
    { kind: "timed", catalogId: "dead-bug", seconds: 40, restSeconds: 10 },
  ],
})

const withIds = (ids: ReadonlyArray<string>, extra: Partial<ProgramDay> = {}) =>
  Schema.decodeUnknownSync(ProgramDay)({
    ...running,
    ...extra,
    items: running.items.map((item, index) => ({
      ...item,
      catalogId: ids[index] ?? item.catalogId,
    })),
  })

describe("mergeDay", () => {
  it("returns the running day itself when no name changed", () => {
    expect(mergeDay(running, withIds(["plank", "crunch", "dead-bug"]))).toBe(running)
  })

  it("takes the new catalog id of a swapped item and nothing else", () => {
    const merged = mergeDay(running, withIds(["plank", "bicycle-crunch", "dead-bug"]))
    expect(merged.items.map((item) => item.catalogId)).toEqual([
      "plank",
      "bicycle-crunch",
      "dead-bug",
    ])
    expect(merged.items[1]).toEqual({
      kind: "reps",
      catalogId: "bicycle-crunch",
      reps: 15,
      restSeconds: 20,
      sets: 1,
    })
    expect(merged.items[0]).toBe(running.items[0])
    expect(merged.items[2]).toBe(running.items[2])
    expect([merged.rounds, merged.dayNumber, merged.restBetweenRoundsSeconds]).toEqual([2, 3, 60])
  })

  it("keeps the running durations even when the re-read day differs", () => {
    const reread = Schema.decodeUnknownSync(ProgramDay)({
      ...running,
      items: [
        { kind: "timed", catalogId: "side-plank", seconds: 99, restSeconds: 99 },
        running.items[1],
        running.items[2],
      ],
    })
    const merged = mergeDay(running, reread)
    expect(merged.items[0]).toEqual({
      kind: "timed",
      catalogId: "side-plank",
      seconds: 30,
      restSeconds: 10,
    })
  })

  it("ignores a re-read item of another kind, and a day with fewer items", () => {
    const otherKind = Schema.decodeUnknownSync(ProgramDay)({
      ...running,
      items: [
        { kind: "reps", catalogId: "side-plank", reps: 10, restSeconds: 10 },
        running.items[1],
      ],
    })
    expect(mergeDay(running, otherKind)).toBe(running)
  })
})

describe("run plan (swap boundaries)", () => {
  const working = (round: number, stepIndex: number): PlayerState => ({
    _tag: "Working",
    round,
    stepIndex,
    startedAtMs: 0,
    pausedMs: 0,
    phaseStartMs: 0,
    endsAtMs: Option.none(),
  })
  const resting = (round: number, stepIndex: number): PlayerState => ({
    _tag: "Resting",
    round,
    stepIndex,
    startedAtMs: 0,
    pausedMs: 0,
    phaseStartMs: 0,
    endsAtMs: 1000,
  })
  const swapped = withIds(["plank", "bicycle-crunch", "dead-bug"])
  const written = initialPlan(running)

  it("starts as the day writes every round", () => {
    expect(written).toHaveLength(6)
    expect(written.slice(0, 3)).toEqual(["plank", "crunch", "dead-bug"])
    expect(written.slice(3)).toEqual(["plank", "crunch", "dead-bug"])
  })

  it("a swap while the item runs renames it and every later round, not the ones done", () => {
    // Round 2 (index 1), item 2 (index 1) is running: swapping crunch renames it from there.
    const plan = reconcilePlan(written, running, swapped, working(1, 1))
    expect(plan).toEqual(["plank", "crunch", "dead-bug", "plank", "bicycle-crunch", "dead-bug"])
  })

  it("a swap while resting after the item leaves that item-round as performed", () => {
    const plan = reconcilePlan(written, running, swapped, resting(0, 1))
    expect(plan.slice(0, 3)).toEqual(["plank", "crunch", "dead-bug"])
    expect(plan.slice(3)).toEqual(["plank", "bicycle-crunch", "dead-bug"])
  })

  it("a swap on a later item leaves the earlier items of this round alone", () => {
    const later = withIds(["plank", "crunch", "bird-dog"])
    const plan = reconcilePlan(written, running, later, working(0, 1))
    expect(plan).toEqual(["plank", "crunch", "bird-dog", "plank", "crunch", "bird-dog"])
  })

  it("a swap then a revert: the reverted round and later run the original again", () => {
    const first = reconcilePlan(written, running, swapped, working(0, 1))
    expect(first[1]).toBe("bicycle-crunch")
    // `swapped` is now the running day; round 3 would be next but only 2 rounds exist: use round 2.
    const second = reconcilePlan(first, swapped, running, working(1, 1))
    expect(second).toEqual(["plank", "bicycle-crunch", "dead-bug", "plank", "crunch", "dead-bug"])
  })

  it("changes nothing once the run is done", () => {
    const done: PlayerState = { _tag: "Done", durationSeconds: 10 }
    expect(reconcilePlan(written, running, swapped, done)).toEqual(written)
  })
})
