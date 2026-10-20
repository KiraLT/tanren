import { useState } from "react"
import { Platform, type ViewStyle } from "react-native"
import { useTheme } from "./theme"
import { stroke } from "./tokens"

/** True when the browser would draw its own focus ring (keyboard focus, not a mouse click). */
const focusVisible = (): boolean =>
  typeof document !== "undefined" && (document.activeElement?.matches(":focus-visible") ?? false)

export interface PressableInteraction {
  readonly hovered: boolean
  /** Spread onto the `Pressable`: hover and focus tracking, inert on native. */
  readonly handlers: {
    readonly onHoverIn?: () => void
    readonly onHoverOut?: () => void
    readonly onFocus?: () => void
    readonly onBlur?: () => void
  }
  /** 2 px `focus` outline for keyboard focus on web, empty otherwise. */
  readonly focusStyle: ViewStyle
}

/**
 * Hover and keyboard-focus state for web pressables (design §5). RNW's `hovered` style-callback
 * flag is runtime-only (not in `Pressable.d.ts`), so hover is tracked with `onHoverIn/Out`; the
 * ring is an `outline*` style, shown only for `:focus-visible`.
 */
export function usePressableInteraction(): PressableInteraction {
  const { colors } = useTheme()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  if (Platform.OS !== "web") {
    return { hovered: false, handlers: {}, focusStyle: {} }
  }
  return {
    hovered,
    handlers: {
      onHoverIn: () => setHovered(true),
      onHoverOut: () => setHovered(false),
      onFocus: () => setFocused(focusVisible()),
      onBlur: () => setFocused(false),
    },
    focusStyle: focused
      ? {
          outlineColor: colors.focus,
          outlineStyle: "solid",
          outlineWidth: stroke.outline,
          outlineOffset: 2,
        }
      : {},
  }
}
