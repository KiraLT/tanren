import { RepTarget, Rpe, WeightKg } from "@tanren/shared"
import { Option, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { buildSetRows, formatPlannedSet, formatRepTarget } from "./setRows"

const target = Schema.decodeUnknownSync(RepTarget)

describe("buildSetRows", () => {
  it("pairs the n-th logged set with the n-th planned set", () => {
    const rows = buildSetRows(["p1", "p2", "p3"], ["l1"])
    expect(rows.map((row) => [row.position, row.planned, row.logged])).toEqual([
      [1, Option.some("p1"), Option.some("l1")],
      [2, Option.some("p2"), Option.none()],
      [3, Option.some("p3"), Option.none()],
    ])
  })

  it("appends extra logged sets beyond the plan", () => {
    const rows = buildSetRows(["p1"], ["l1", "l2"])
    expect(rows).toHaveLength(2)
    expect(rows[1]).toEqual({ position: 2, planned: Option.none(), logged: Option.some("l2") })
  })

  it("handles an unplanned exercise", () => {
    expect(buildSetRows([], [])).toEqual([])
  })
})

describe("formatRepTarget", () => {
  it("formats exact and range targets", () => {
    expect(formatRepTarget(target({ _tag: "Exact", reps: 8 }))).toBe("8")
    expect(formatRepTarget(target({ _tag: "Range", min: 8, max: 10 }))).toBe("8-10")
  })
})

describe("formatPlannedSet", () => {
  it("includes weight and RPE when present", () => {
    const text = formatPlannedSet({
      targetWeightKg: Option.some(WeightKg.make(80)),
      targetReps: target({ _tag: "Range", min: 8, max: 10 }),
      targetRpe: Option.some(Rpe.make(8)),
    })
    expect(text).toBe("80 kg × 8-10 · RPE 8")
  })

  it("leaves out absent targets", () => {
    const text = formatPlannedSet({
      targetWeightKg: Option.none(),
      targetReps: target({ _tag: "Exact", reps: 12 }),
      targetRpe: Option.none(),
    })
    expect(text).toBe("12")
  })
})
