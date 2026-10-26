import { describe, expect, it } from "vitest"
import {
  type ColumnSplit,
  columnsFor,
  dividerLeft,
  effectiveSplit,
  MIN_COLUMN,
  pageMargin,
  pageWidths,
  SPLIT_MIN_WINDOW,
} from "./columns"
import { sizes } from "./tokens"

describe("effectiveSplit", () => {
  const splits: ReadonlyArray<ColumnSplit> = ["7/5", "5/7", "6/6"]

  it("is 6/6 for every split below 1024", () => {
    expect(SPLIT_MIN_WINDOW).toBe(1024)
    ;[390, 768, 900, 1000, 1023].forEach((width) => {
      splits.forEach((split) => {
        expect(effectiveSplit(width, split)).toBe("6/6")
      })
    })
  })

  it("is the requested split from 1024 up", () => {
    ;[1024, 1280, 1440, 1920].forEach((width) => {
      splits.forEach((split) => {
        expect(effectiveSplit(width, split)).toBe(split)
      })
    })
  })
})

describe("pageWidths", () => {
  it("caps header and body together at contentMaxWidth on phone and tablet", () => {
    const capped = { outer: sizes.contentMaxWidth, bodyMax: undefined }
    expect(pageWidths(columnsFor(390), false, false)).toEqual(capped)
    expect(pageWidths(columnsFor(768), false, false)).toEqual(capped)
  })

  it("narrow desktop: header spans the page, only the body is capped at 600", () => {
    expect(pageWidths(columnsFor(1280), false, false)).toEqual({ outer: 1216, bodyMax: 600 })
    expect(pageWidths(columnsFor(1440), false, false)).toEqual({ outer: 1360, bodyMax: 600 })
  })

  it("two-column and wide desktop: page width, body uncapped", () => {
    expect(pageWidths(columnsFor(1280), true, false)).toEqual({ outer: 1216, bodyMax: undefined })
    expect(pageWidths(columnsFor(1280), false, true)).toEqual({ outer: 1216, bodyMax: undefined })
  })
})

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

  it("renders every split as 6/6 at 900: 404 / 408 (page 836)", () => {
    expect(MIN_COLUMN).toBe(364)
    const six = { page: 836, main: 404, side: 408, gap: 24 }
    expect(columnsFor(900, "7/5")).toMatchObject(six)
    expect(columnsFor(900, "5/7")).toMatchObject(six)
    expect(columnsFor(900, "6/6")).toMatchObject(six)
  })

  it("renders every split as 6/6 at 1023 (page 959: 468 / 467)", () => {
    const six = { page: 959, main: 468, side: 467 }
    expect(columnsFor(1023, "7/5")).toMatchObject(six)
    expect(columnsFor(1023, "5/7")).toMatchObject(six)
    expect(columnsFor(1023, "6/6")).toMatchObject(six)
  })

  it("applies the requested split again from 1024 (page 960)", () => {
    // inner 936: 7/5 = 546 -> 544 on the grid, side 392; 5/7 = 390 -> 388 (ties down), side 548; both >= MIN_COLUMN.
    expect(columnsFor(1024, "7/5")).toMatchObject({ page: 960, main: 544, side: 392 })
    expect(columnsFor(1024, "5/7")).toMatchObject({ page: 960, main: 388, side: 548 })
    expect(columnsFor(1024, "6/6")).toMatchObject({ page: 960, main: 468, side: 468 })
  })

  it("still guards MIN_COLUMN from 1024 up", () => {
    const cols = columnsFor(1024, "5/7")
    expect(cols.main).toBeGreaterThanOrEqual(MIN_COLUMN)
    expect(cols.side).toBeGreaterThanOrEqual(MIN_COLUMN)
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

describe("dividerLeft", () => {
  it("centres a 1 px hairline in the 24 px gap", () => {
    expect(dividerLeft(24, 1)).toBe(-12.5)
  })

  it("is 0-gap safe: half the hairline to the left", () => {
    expect(dividerLeft(0, 1)).toBe(-0.5)
    expect(dividerLeft(0, 0)).toBe(-0)
  })
})
