import { describe, expect, it } from "vitest"
import { columnsFor, MIN_COLUMN, pageMargin } from "./columns"
import { sizes } from "./tokens"

describe("columnsFor", () => {
  it("splits 1280 into 696 / 496 for 7/5 (page 1216 = window - 2 x 32)", () => {
    expect(columnsFor(1280, "7/5")).toMatchObject({ page: 1216, main: 696, side: 496, gap: 24 })
  })

  it("defaults to 7/5", () => {
    expect(columnsFor(1280)).toEqual(columnsFor(1280, "7/5"))
  })

  it("splits 1280 into 496 / 696 for 5/7", () => {
    expect(columnsFor(1280, "5/7")).toMatchObject({ main: 496, side: 696 })
  })

  it("splits 1280 into 596 / 596 for 6/6", () => {
    expect(columnsFor(1280, "6/6")).toMatchObject({ main: 596, side: 596 })
  })

  it("uses a 32 px page margin at desktop", () => {
    expect(pageMargin).toBe(32)
    expect(columnsFor(900).page).toBe(836)
    expect(columnsFor(1000).page).toBe(936)
  })

  it("clamps 900 so no column is below MIN_COLUMN (page 836)", () => {
    expect(MIN_COLUMN).toBe(364)
    // 5/7 would give 340 / 472; 7/5 would give 472 / 340 (spec lists 472/364, which sums to 860).
    expect(columnsFor(900, "5/7")).toMatchObject({ page: 836, main: 364, side: 448, gap: 24 })
    expect(columnsFor(900, "7/5")).toMatchObject({ page: 836, main: 448, side: 364, gap: 24 })
  })

  it("keeps 900 6/6 unclamped at 404 / 408", () => {
    expect(columnsFor(900, "6/6")).toMatchObject({ main: 404, side: 408 })
  })

  it("is one full-width column on a phone", () => {
    expect(columnsFor(390)).toEqual({ breakpoint: "phone", page: 390, main: 390, side: 0, gap: 0 })
  })

  it("is one column capped at 600 on a tablet", () => {
    expect(columnsFor(768)).toEqual({ breakpoint: "tablet", page: 600, main: 600, side: 0, gap: 0 })
    expect(columnsFor(600)).toMatchObject({ page: 600, main: 600 })
  })

  it("caps the page at pageMaxWidth (1360) from 1424 up", () => {
    expect(sizes.pageMaxWidth).toBe(1360)
    expect(columnsFor(1440).page).toBe(1360)
    expect(columnsFor(1423).page).toBe(1359)
    expect(columnsFor(1424).page).toBe(1360)
    expect(columnsFor(1920).page).toBe(1360)
    expect(columnsFor(1920, "5/7")).toMatchObject({ main: 556, side: 780 })
  })

  it("keeps the old ExercisePager width below desktop (pixel-equal at 390 and 768)", () => {
    ;[390, 768, 899].forEach((width) => {
      expect(columnsFor(width).main).toBe(Math.min(width, sizes.contentMaxWidth))
    })
  })

  it("always fills the page: main + gap + side = page, main on the 4-pt grid, columns >= MIN_COLUMN", () => {
    const splits = ["7/5", "6/6", "5/7"] as const
    ;[900, 1000, 1100, 1280, 1440, 1500, 1920].forEach((width) => {
      splits.forEach((split) => {
        const cols = columnsFor(width, split)
        expect(cols.main + cols.gap + cols.side).toBe(cols.page)
        expect(cols.main % 4).toBe(0)
        expect(cols.main).toBeGreaterThanOrEqual(MIN_COLUMN)
        expect(cols.side).toBeGreaterThanOrEqual(MIN_COLUMN)
      })
    })
  })
})
