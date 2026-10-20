/** Window width (px) from which Today and Plan show a second (aside) column. */
export const WIDE_BREAKPOINT = 900

/** Window width (px) from which the single column is centred at `contentMaxWidth` with a 24 gutter. */
export const TABLET_BREAKPOINT = 600

export type LayoutMode = "single" | "two-column"

export type Breakpoint = "phone" | "tablet" | "desktop"

/** Pure rule behind `useBreakpoint` (design §5): phone < 600 <= tablet < 900 <= desktop. */
export const breakpointFor = (width: number): Breakpoint =>
  width >= WIDE_BREAKPOINT ? "desktop" : width >= TABLET_BREAKPOINT ? "tablet" : "phone"

/** Pure rule behind `useLayoutMode`: two columns iff the window is at least `WIDE_BREAKPOINT` wide. */
export const layoutModeFor = (width: number): LayoutMode =>
  breakpointFor(width) === "desktop" ? "two-column" : "single"
