import { useWindowDimensions } from "react-native"
import { type Breakpoint, breakpointFor, type LayoutMode, layoutModeFor } from "./layoutMode"

export {
  type Breakpoint,
  breakpointFor,
  type LayoutMode,
  layoutModeFor,
  WIDE_BREAKPOINT,
} from "./layoutMode"

/** Follows window resizes (web) and rotation (iPad); a phone is always "single". */
export const useLayoutMode = (): LayoutMode => layoutModeFor(useWindowDimensions().width)

/** phone / tablet / desktop for the current window (design §5). */
export const useBreakpoint = (): Breakpoint => breakpointFor(useWindowDimensions().width)
