/**
 * The design system barrel (design §4, FROZEN at D1): every screen imports UI from here only.
 * Adding exports is allowed; renaming or removing is not.
 */
export {
  type Breakpoint,
  breakpointFor,
  useBreakpoint,
} from "../hooks/useLayoutMode"
export { AppBar } from "./AppBar"
export { APP_NAV } from "./appNav"
export { Banner } from "./Banner"
export { Button, type ButtonSize, type ButtonVariant } from "./Button"
export { Card } from "./Card"
export { Columns, type ColumnsProps, useColumns } from "./ColumnsView"
export type { ColorRoles } from "./colors"
export {
  type ColumnSplit,
  type ColumnWidths,
  columnsFor,
  effectiveSplit,
  MAIN_SHARE,
  MIN_COLUMN,
  type PageWidths,
  pageMargin,
  pageWidths,
  SPLIT_MIN_WINDOW,
} from "./columns"
export type { SetDotsVariant } from "./controls"
export {
  listSeparatorStyle,
  type SeparatorInset,
  type StepperSize,
  statSlotWidth,
  stepperSizeFor,
} from "./controls"
export { EmptyState } from "./EmptyState"
export { Icon, type IconName } from "./Icon"
export { IconButton } from "./IconButton"
export { type PressableInteraction, usePressableInteraction } from "./interaction"
export {
  type DiscState,
  ListGroup,
  ListRow,
  type RowDisc,
  type RowTitleVariant,
  useGrouped,
} from "./ListRow"
export { Page } from "./Page"
export { ProgressRing, type RingSize } from "./ProgressRing"
export { SegmentBar } from "./SegmentBar"
export { SegmentedControl } from "./SegmentedControl"
export { SetDots } from "./SetDots"
export { Skeleton } from "./Skeleton"
export { type StatItem, StatRow, type StatRowProps } from "./StatRow"
export { StatusPill } from "./StatusPill"
export { Stepper } from "./Stepper"
export { Text } from "./Text"
export {
  type Scheme,
  type Theme,
  type ThemePreference,
  ThemeProvider,
  useReducedMotion,
  useStyles,
  useTheme,
  useThemePreference,
} from "./ThemeProvider"
export { TimerRing } from "./TimerRing"
export { ToggleChip } from "./ToggleChip"
export {
  breakpoints,
  elevation,
  gutter,
  motion,
  radius,
  rhythm,
  sizes,
  space,
  statusTone,
  stroke,
  type Tone,
  type TypeVariant,
  tooltip,
  type,
} from "./tokens"
