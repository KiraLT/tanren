import { describe, expect, it } from "@effect/vitest"
import { Option } from "effect"
import {
  begin,
  finish,
  type GateState,
  isBusy,
  OPEN_GATE,
  observed,
  type WriteKind,
} from "./writeGate"

const refused = (state: GateState, kind: WriteKind): boolean => Option.isNone(begin(state, kind))

/** Starts a write; a refusal fails the test (the state would be unchanged and the counts wrong). */
const start = (state: GateState, kind: WriteKind): GateState => {
  expect(refused(state, kind)).toBe(false)
  return Option.getOrElse(begin(state, kind), () => state)
}

describe("queued writes", () => {
  it("any number run at once, each landing on the previous one", () => {
    const twice = start(start(OPEN_GATE, "queued"), "queued")
    expect(twice.pending).toBe(2)
    expect(isBusy(twice)).toBe(true)
  })

  it("are dropped while a positional write is pending (their index would be stale)", () => {
    expect(refused(start(OPEN_GATE, "positional"), "queued")).toBe(true)
    expect(refused(start(OPEN_GATE, "leave"), "queued")).toBe(true)
  })

  it("recover after a failed save: not busy, and the next tap runs", () => {
    const failed = finish(start(OPEN_GATE, "queued"), "queued", Option.none())
    expect(isBusy(failed)).toBe(false)
    expect(refused(failed, "queued")).toBe(false)
  })
})

describe("positional writes (move, remove)", () => {
  it("are ignored while any write is in flight", () => {
    expect(refused(start(OPEN_GATE, "queued"), "positional")).toBe(true)
    expect(refused(start(OPEN_GATE, "positional"), "positional")).toBe(true)
  })

  it("run again once a failed write landed, or a saved one has been rendered", () => {
    const saved = observed(finish(start(OPEN_GATE, "positional"), "positional", Option.some(2)), 2)
    const failed = finish(start(OPEN_GATE, "positional"), "positional", Option.none())
    expect([isBusy(saved), refused(saved, "positional")]).toEqual([false, false])
    expect([isBusy(failed), refused(failed, "positional")]).toEqual([false, false])
  })
})

describe("leave writes (remove day, pick, create)", () => {
  it("lock the gate for good once saved: a second tap while the screen leaves is ignored", () => {
    const saved = finish(start(OPEN_GATE, "leave"), "leave", Option.some(2))
    expect(isBusy(saved)).toBe(true)
    expect(
      (["queued", "positional", "leave"] as const).map((kind) => refused(saved, kind)),
    ).toEqual([true, true, true])
  })

  it("can be retried after a failed save, and busy recovers", () => {
    const failed = finish(start(OPEN_GATE, "leave"), "leave", Option.none())
    expect(failed).toEqual(OPEN_GATE)
    expect(isBusy(failed)).toBe(false)
    expect(refused(failed, "leave")).toBe(false)
  })

  it("a double tap before the first settles starts one write", () => {
    const first = start(OPEN_GATE, "leave")
    expect(refused(first, "leave")).toBe(true)
  })
})

describe("a saved positional write", () => {
  const saved = finish(start(OPEN_GATE, "positional"), "positional", Option.some(5))

  it("keeps queued and positional writes refused until the screen rendered its version", () => {
    expect([refused(saved, "queued"), refused(saved, "positional")]).toEqual([true, true])
    expect(isBusy(saved)).toBe(true)
  })

  it("an older render does not release it; the saved version or a later one does", () => {
    expect(refused(observed(saved, 4), "positional")).toBe(true)
    expect(
      [5, 6].map((version) => {
        const open = observed(saved, version)
        return [refused(open, "queued"), refused(open, "positional"), isBusy(open)]
      }),
    ).toEqual([
      [false, false, false],
      [false, false, false],
    ])
  })

  it("a failed positional write waits for nothing", () => {
    const failed = finish(start(OPEN_GATE, "positional"), "positional", Option.none())
    expect(isBusy(failed)).toBe(false)
  })

  it("a saved queued write waits for nothing (its change is a function of the stored row)", () => {
    const queued = finish(start(OPEN_GATE, "queued"), "queued", Option.some(3))
    expect([isBusy(queued), refused(queued, "queued")]).toEqual([false, false])
  })
})
