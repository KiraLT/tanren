import { describe, expect, it } from "@effect/vitest"
import { Array as Arr, Order } from "effect"
import {
  DETAILS,
  mirrorPath,
  PANEL_WIDTH,
  PANELS,
  pathPoints,
  REGIONS,
  SILHOUETTE,
  shiftPath,
  VIEW_BOX_SIZE,
} from "./body"
import { REGION_IDS } from "./regions"

const panelBounds = (panel: (typeof PANELS)[number]) =>
  panel === "front" ? { min: 0, max: PANEL_WIDTH } : { min: PANEL_WIDTH, max: VIEW_BOX_SIZE }

describe("REGIONS", () => {
  it("draws every region id exactly once, each with at least one path", () => {
    const sorted = (ids: ReadonlyArray<string>) => Arr.sort(ids, Order.String)
    expect(sorted(REGIONS.map((region) => region.id))).toEqual(sorted(REGION_IDS))
    expect(REGIONS.filter((region) => region.paths.length === 0)).toEqual([])
  })

  it("keeps every region's points inside its own panel", () => {
    const outside = REGIONS.flatMap((region) => {
      const { min, max } = panelBounds(region.panel)
      return region.paths
        .flatMap(pathPoints)
        .filter(([x, y]) => x < min || x > max || y < 0 || y > VIEW_BOX_SIZE)
        .map((point) => `${region.id} ${point.join(",")}`)
    })
    expect(outside).toEqual([])
  })

  it("draws muscles in mirrored pairs, except the heart marker", () => {
    const unpaired = REGIONS.filter(
      (region) => region.id !== "heart" && region.paths.length % 2 !== 0,
    )
    expect(unpaired).toEqual([])
  })
})

describe("SILHOUETTE and DETAILS", () => {
  it("aligns the back figure with the front one, shifted by a panel width", () => {
    PANELS.forEach((panel) => {
      expect(SILHOUETTE[panel].outline).toHaveLength(2)
      expect(SILHOUETTE[panel].fill).toHaveLength(2)
    })
    const frontY = pathPoints(SILHOUETTE.front.outline[0] ?? "").map(([, y]) => y)
    const backY = pathPoints(SILHOUETTE.back.outline[0] ?? "").map(([, y]) => y)
    expect(backY).toEqual(frontY)
    expect(SILHOUETTE.back.outline[0]).toBe(shiftPath(SILHOUETTE.front.outline[0] ?? "", 200))
  })

  it("keeps details inside their panel", () => {
    const outside = PANELS.flatMap((panel) => {
      const { min, max } = panelBounds(panel)
      return DETAILS[panel].flatMap(pathPoints).filter(([x]) => x < min || x > max)
    })
    expect(outside).toEqual([])
  })
})

describe("path helpers", () => {
  it("mirrors x about the panel centre and leaves y alone", () => {
    expect(mirrorPath("M 90 10 C 80 20 70 30 60 40 Z")).toBe("M 110 10 C 120 20 130 30 140 40 Z")
  })

  it("shifts x only", () => {
    expect(shiftPath("M 1 2 L 3 4", 200)).toBe("M 201 2 L 203 4")
  })

  it("lists the points a path names", () => {
    expect(pathPoints("M 1 2 C 3 4 5 6 7 8 Z")).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
      [7, 8],
    ])
  })
})
