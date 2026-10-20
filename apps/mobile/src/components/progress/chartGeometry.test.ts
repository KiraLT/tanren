import { Option } from "effect"
import { describe, expect, it } from "vitest"
import { BASELINE, barRects, sparklineShape } from "./chartGeometry"

const size = { width: 200, height: 100 }

describe("barRects", () => {
  it("draws one bar per value, scaled to the peak, bottom aligned", () => {
    const rects = barRects([0, 0, 50, 0, 0, 0, 25, 100], size, 8)
    expect(rects).toHaveLength(8)
    const tallest = rects[7]
    expect(tallest).toMatchObject({ y: 0, height: 100 })
    expect(rects[2]).toMatchObject({ height: 50, y: 50 })
    expect(rects[6]).toMatchObject({ height: 25, y: 75 })
    // bars tile the width exactly: last bar ends at `width`
    expect((tallest?.x ?? 0) + (tallest?.width ?? 0)).toBeCloseTo(size.width)
  })

  it("keeps empty weeks as a baseline stub, never zero height", () => {
    const rects = barRects([0, 40], size, 8)
    expect(rects[0]).toMatchObject({ height: BASELINE, y: size.height - BASELINE })
  })

  it("draws a flat baseline when every value is zero", () => {
    const rects = barRects([0, 0, 0, 0, 0, 0, 0, 0], size, 8)
    expect(rects).toHaveLength(8)
    expect(new Set(rects.map((rect) => rect.height))).toEqual(new Set([BASELINE]))
    expect(new Set(rects.map((rect) => rect.y))).toEqual(new Set([size.height - BASELINE]))
  })

  it("never lets a tiny value fall below the baseline stub", () => {
    const rects = barRects([1, 1000], size, 8)
    expect(rects[0]?.height).toBe(BASELINE)
  })

  it("returns nothing for no values", () => {
    expect(barRects([], size, 8)).toEqual([])
  })
})

describe("sparklineShape", () => {
  const some = Option.some
  const none = Option.none<number>()

  it("joins consecutive weeks into one polyline", () => {
    const shape = sparklineShape([some(100), some(110), some(120)], size, 0)
    expect(shape.segments).toEqual(["0,100 100,50 200,0"])
    expect(shape.dots).toHaveLength(3)
  })

  it("breaks the line at a week without sets", () => {
    const shape = sparklineShape([some(100), some(110), none, some(120), some(130)], size, 0)
    expect(shape.segments).toHaveLength(2)
    expect(shape.dots).toHaveLength(4)
  })

  it("keeps an isolated week as a dot with no segment", () => {
    const shape = sparklineShape([none, some(100), none, none, none, none, none, none], size, 0)
    expect(shape.segments).toEqual([])
    expect(shape.dots).toHaveLength(1)
  })

  it("draws a flat mid line when all values are equal", () => {
    const shape = sparklineShape([some(100), some(100)], size, 0)
    expect(shape.segments).toEqual(["0,50 200,50"])
  })

  it("is empty when no week has a set", () => {
    expect(sparklineShape([none, none, none], size, 0)).toEqual({ segments: [], dots: [] })
  })

  it("centres a single week", () => {
    const shape = sparklineShape([some(100)], size, 0)
    expect(shape.dots).toEqual([{ x: 100, y: 50 }])
  })
})
