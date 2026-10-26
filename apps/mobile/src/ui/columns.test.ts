import { describe, expect, it } from "vitest"
import { columnsFor } from "./columns"
import { sizes } from "./tokens"

describe("columnsFor", () => {
  it("splits 1280 into 648 / 464 for 7/5", () => {
    expect(columnsFor(1280, "7/5")).toMatchObject({ page: 1136, main: 648, side: 464, gap: 24 })
  })

  it("defaults to 7/5", () => {
    expect(columnsFor(1280)).toEqual(columnsFor(1280, "7/5"))
  })

  it("splits 1280 into 464 / 648 for 5/7", () => {
    expect(columnsFor(1280, "5/7")).toMatchObject({ main: 464, side: 648 })
  })

  it("splits 1280 into 556 / 556 for 6/6", () => {
    expect(columnsFor(1280, "6/6")).toMatchObject({ main: 556, side: 556 })
  })

  it("splits 900 into 512 / 364 for 7/5 (page = window)", () => {
    expect(columnsFor(900, "7/5")).toMatchObject({ page: 900, main: 512, side: 364, gap: 24 })
  })

  it("splits 900 for 5/7 and 6/6", () => {
    expect(columnsFor(900, "5/7")).toMatchObject({ main: 364, side: 512 })
    expect(columnsFor(900, "6/6")).toMatchObject({ main: 436, side: 440 })
  })

  it("is one full-width column on a phone", () => {
    expect(columnsFor(390)).toEqual({ breakpoint: "phone", page: 390, main: 390, side: 0, gap: 0 })
  })

  it("is one column capped at 600 on a tablet", () => {
    expect(columnsFor(768)).toEqual({ breakpoint: "tablet", page: 600, main: 600, side: 0, gap: 0 })
    expect(columnsFor(600)).toMatchObject({ page: 600, main: 600 })
  })

  it("caps the page at pageMaxWidth on wide windows", () => {
    expect(columnsFor(1920).page).toBe(1136)
    expect(columnsFor(1920).page).toBe(sizes.pageMaxWidth)
    expect(columnsFor(1920, "5/7")).toMatchObject({ main: 464, side: 648 })
  })

  it("keeps the old ExercisePager width below desktop (pixel-equal at 390 and 768)", () => {
    ;[390, 768, 899].forEach((width) => {
      expect(columnsFor(width).main).toBe(Math.min(width, sizes.contentMaxWidth))
    })
  })

  it("always fills the page: main + gap + side = page, main on the 4-pt grid", () => {
    const splits = ["7/5", "6/6", "5/7"] as const
    ;[900, 1000, 1100, 1280, 1500].forEach((width) => {
      splits.forEach((split) => {
        const cols = columnsFor(width, split)
        expect(cols.main + cols.gap + cols.side).toBe(cols.page)
        expect(cols.main % 4).toBe(0)
      })
    })
  })
})
