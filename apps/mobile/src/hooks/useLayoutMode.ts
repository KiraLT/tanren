import { useWindowDimensions } from "react-native"
import { type LayoutMode, layoutModeFor } from "./layoutMode"

export { type LayoutMode, layoutModeFor, WIDE_BREAKPOINT } from "./layoutMode"

/** Follows window resizes (web) and rotation (iPad); a phone is always "single". */
export const useLayoutMode = (): LayoutMode => layoutModeFor(useWindowDimensions().width)
