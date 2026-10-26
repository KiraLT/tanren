import { type Breakpoint, breakpointFor } from "../hooks/layoutMode"
import { gutter, sizes, space } from "./tokens"

/** Main : side share of the content width at desktop (focus left, master-detail, symmetric). */
export type ColumnSplit = "7/5" | "6/6" | "5/7"

export interface ColumnWidths {
  readonly breakpoint: Breakpoint
  /** The page column `Page` centres: window at phone, min(window, 600) at tablet, min(window - 2 * 32, 1360) at desktop. */
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

/** Window margin each side of the desktop page (ui-polish D1): 32 at 1280, wider only past 1360. */
export const pageMargin = gutter.desktop

/** No desktop column is narrower than this (inner 300 after the 32 padding, ui-desktop §3). */
export const MIN_COLUMN = 364

export interface PageWidths {
  /** `maxWidth` of the column that holds the header and the body. */
  readonly outer: number
  /** Extra `maxWidth` for a centred body inside `outer`; `None` when the body fills it. */
  readonly bodyMax: number | undefined
}

/**
 * Widths `Page` applies. Phone/tablet: header and body share the `contentMaxWidth` column. Desktop:
 * the header always spans `columns.page`; a narrow page (no aside, not wide) caps only its body.
 */
export const pageWidths = (
  columns: ColumnWidths,
  twoColumn: boolean,
  wideBody: boolean,
): PageWidths => {
  if (columns.breakpoint !== "desktop") return { outer: sizes.contentMaxWidth, bodyMax: undefined }
  if (twoColumn || wideBody) return { outer: columns.page, bodyMax: undefined }
  return { outer: columns.page, bodyMax: sizes.contentMaxWidth }
}

/** Below this window width every split renders 6/6 (desktop designer r1: 364 columns wrapped lists). */
export const SPLIT_MIN_WINDOW = 1024

/** The split actually rendered: 6/6 below `SPLIT_MIN_WINDOW`, the requested one from there up. */
export const effectiveSplit = (width: number, split: ColumnSplit): ColumnSplit =>
  width < SPLIT_MIN_WINDOW ? "6/6" : split

/** Column widths for a window width; the one place that knows `pageMaxWidth` and the split maths. */
export const columnsFor = (width: number, requested: ColumnSplit = "7/5"): ColumnWidths => {
  const split = effectiveSplit(width, requested)
  const breakpoint = breakpointFor(width)
  if (breakpoint === "phone") return { breakpoint, page: width, main: width, side: 0, gap: 0 }
  if (breakpoint === "tablet") {
    const page = Math.min(width, sizes.contentMaxWidth)
    return { breakpoint, page, main: page, side: 0, gap: 0 }
  }
  const page = Math.min(width - 2 * pageMargin, sizes.pageMaxWidth)
  const gap = space.xl
  const inner = page - gap
  // Ties round down (1280, "6/6" has none; 900 "6/6": 101.5 grid steps -> 404 / 408).
  const share = Math.ceil((inner * MAIN_SHARE[split]) / GRID - 0.5) * GRID
  // Clamp so neither column drops below MIN_COLUMN while main stays on the grid and
  // main + gap + side = page. Only reachable from 1024 up in practice (below it the split is 6/6).
  const lowest = Math.ceil(MIN_COLUMN / GRID) * GRID
  const highest = Math.floor((inner - MIN_COLUMN) / GRID) * GRID
  const main = Math.min(highest, Math.max(lowest, share))
  return { breakpoint, page, main, side: inner - main, gap }
}

/**
 * `left` of the absolutely positioned column hairline inside the side column, so its centre sits
 * mid-gap between the two columns: -(gap + hairline) / 2. Widths stay untouched.
 */
export const dividerLeft = (gap: number, hairline: number): number => -(gap + hairline) / 2
