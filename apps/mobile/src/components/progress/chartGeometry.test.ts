import { Option } from "effect"
import { describe, expect, it } from "vitest"
import {
  BASELINE,
  barRects,
  columnCenters,
  hoverBand,
  roundedTopBarPath,
  sparklineShape,
  TOOLTIP_MAX_WIDTH,
  TOOLTIP_PAD_X,
  tooltipCaption,
  tooltipLeft,
  tooltipWidth,
} from "./chartGeometry"

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

describe("barRects with a width cap", () => {
  const values = [10, 20, 30, 40, 50, 60, 70, 80]
  const wide = { width: 326, height: 100 }

  it("caps the bar and keeps at least the requested gap between neighbours", () => {
    const rects = barRects(values, wide, 2, 24)
    expect(new Set(rects.map((rect) => rect.width))).toEqual(new Set([24]))
    const [first, second] = rects
    expect((second?.x ?? 0) - ((first?.x ?? 0) + (first?.width ?? 0))).toBeGreaterThanOrEqual(2)
  })

  it("centres a capped bar in its slot and stays inside the chart", () => {
    const rects = barRects(values, wide, 2, 24)
    const last = rects[7]
    expect((last?.x ?? 0) + (last?.width ?? 0)).toBeLessThanOrEqual(wide.width)
    expect(rects[0]?.x).toBeGreaterThan(0)
  })

  it("leaves bars that are narrower than the cap alone", () => {
    expect(barRects(values, { width: 100, height: 100 }, 2, 24)).toEqual(
      barRects(values, { width: 100, height: 100 }, 2),
    )
  })
})

describe("roundedTopBarPath", () => {
  it("rounds the data end with 4 px arcs and leaves the baseline end square", () => {
    const path = roundedTopBarPath({ x: 10, y: 20, width: 24, height: 60 }, 4)
    expect(path).toBe("M10,80 L10,24 A4,4 0 0 1 14,20 L30,20 A4,4 0 0 1 34,24 L34,80 Z")
  })

  it("shrinks the radius for a stub shorter than the radius", () => {
    expect(roundedTopBarPath({ x: 0, y: 98, width: 24, height: 2 }, 4)).toContain("A2,2")
  })
})

describe("tooltipLeft", () => {
  it("centres on the mark", () => {
    expect(tooltipLeft(100, 60, 300)).toBe(70)
  })

  it("clamps to both edges", () => {
    expect(tooltipLeft(5, 60, 300)).toBe(0)
    expect(tooltipLeft(295, 60, 300)).toBe(240)
  })
})

describe("columnCenters and hoverBand", () => {
  it("spreads centres between the paddings", () => {
    expect(columnCenters(3, 200, 10)).toEqual([10, 100, 190])
    expect(columnCenters(1, 200, 10)).toEqual([100])
  })

  it("tiles the plot with bands, each wider than a mark", () => {
    const centers = columnCenters(4, 300, 20)
    const bands = centers.map((_, index) => hoverBand(centers, index, 300))
    expect(bands[0]?.x).toBe(0)
    const last = bands[3]
    expect((last?.x ?? 0) + (last?.width ?? 0)).toBe(300)
    const total = bands.reduce((sum, band) => sum + band.width, 0)
    expect(total).toBe(300)
  })
})

describe("tooltipCaption and tooltipWidth", () => {
  it("joins value and label on one line and shortens 'Week of'", () => {
    expect(tooltipCaption("4,110 kg", "Week of 5 Oct")).toBe("4,110 kg · wk of 5 Oct")
    expect(tooltipCaption("1,175 kg", "This week")).toBe("1,175 kg · This week")
  })

  it("gives the 18-character first-bar label room for its whole text", () => {
    // "0 kg · wk of 7 Sep": text 110.33 px + 2 x TOOLTIP_PAD_X + 2 x 1 px border = 136.33, which
    // onLayout reports as 136; the pinned width must not be below the real pill (it was 128 vs
    // 128.33 before, and the label ended in an ellipsis)
    const caption = tooltipCaption("0 kg", "Week of 7 Sep")
    expect(caption).toHaveLength(18)
    const natural = 110.33 + 2 * TOOLTIP_PAD_X + 2
    const width = tooltipWidth(Math.floor(natural), 358)
    expect(width).toBeGreaterThanOrEqual(natural)
    expect(width).toBeLessThanOrEqual(TOOLTIP_MAX_WIDTH)
  })

  it("keeps a short pill natural (plus 1 px of slack) and caps a long one at 180", () => {
    expect(tooltipWidth(120, 300)).toBe(121)
    expect(tooltipWidth(119.6, 300)).toBe(121)
    expect(tooltipWidth(240, 300)).toBe(TOOLTIP_MAX_WIDTH)
  })

  it("never exceeds a chart narrower than the pill, and left-clamps there", () => {
    const width = tooltipWidth(160, 100)
    expect(width).toBe(100)
    expect(tooltipLeft(90, width, 100)).toBe(0)
  })

  it("clamps the right edge with the capped width", () => {
    expect(tooltipLeft(340, tooltipWidth(240, 358), 358)).toBe(178)
  })

  it("clamps the first bar's pill to the left edge and the last bar's to the right", () => {
    const width = tooltipWidth(136, 358)
    expect(tooltipLeft(11, width, 358)).toBe(0)
    expect(tooltipLeft(347, width, 358)).toBe(358 - width)
  })
})
