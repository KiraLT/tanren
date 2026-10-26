import { type Breakpoint, breakpointFor } from "../hooks/layoutMode"
import { sizes, space } from "./tokens"

/** Main : side share of the content width at desktop (focus left, master-detail, symmetric). */
export type ColumnSplit = "7/5" | "6/6" | "5/7"

export interface ColumnWidths {
  readonly breakpoint: Breakpoint
  /** The page column `Page` centres: window at phone, min(window, 600) at tablet, min(window, 1136) at desktop. */
  readonly page: number
  /** Main column (incl. its 32 padding). Phone: window; tablet: page; desktop: the split share. */
  readonly main: number
  /** Side column; 0 below desktop. */
  readonly side: number
  /** 24 at desktop, else 0. */
  readonly gap: number
}

export const MAIN_SHARE: { readonly [S in ColumnSplit]: number } = {
  "7/5": 7 / 12,
  "6/6": 1 / 2,
  "5/7": 5 / 12,
}

/** Main-column widths are rounded to the 4-pt grid. */
const GRID = 4

/** Column widths for a window width; the one place that knows `pageMaxWidth` and the split maths. */
export const columnsFor = (width: number, split: ColumnSplit = "7/5"): ColumnWidths => {
  const breakpoint = breakpointFor(width)
  if (breakpoint === "phone") return { breakpoint, page: width, main: width, side: 0, gap: 0 }
  if (breakpoint === "tablet") {
    const page = Math.min(width, sizes.contentMaxWidth)
    return { breakpoint, page, main: page, side: 0, gap: 0 }
  }
  const page = Math.min(width, sizes.pageMaxWidth)
  const gap = space.xl
  // Ties round down (900, "6/6": 109.5 grid steps -> 436 / 440), as the spec's pinned cases require.
  const main = Math.ceil(((page - gap) * MAIN_SHARE[split]) / GRID - 0.5) * GRID
  return { breakpoint, page, main, side: page - gap - main, gap }
}
