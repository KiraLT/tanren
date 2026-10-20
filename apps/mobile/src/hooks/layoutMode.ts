/** Window width (px) from which Today and Plan show a second (aside) column. */
export const WIDE_BREAKPOINT = 900

export type LayoutMode = "single" | "two-column"

/** Pure rule behind `useLayoutMode`: two columns iff the window is at least `WIDE_BREAKPOINT` wide. */
export const layoutModeFor = (width: number): LayoutMode =>
  width >= WIDE_BREAKPOINT ? "two-column" : "single"
