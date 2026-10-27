import type { Href } from "expo-router"
import type { IconName } from "./iconPaths"

export interface AppNavLink {
  /** The `(tabs)` route file name. */
  readonly name: string
  readonly href: Href
  readonly label: string
  /** The tab-bar glyph (ui-direction-final §6). */
  readonly icon: IconName
}

/**
 * The top-level destinations, in tab order (ADR-0029); the tab bar and `AppBar` (at `desktop`)
 * render them. Plan, Programs and Library are segments of Train (`/train?view=`), not tabs.
 */
export const APP_NAV: ReadonlyArray<AppNavLink> = [
  { name: "home", href: "/home", label: "Home", icon: "home" },
  { name: "train", href: "/train", label: "Train", icon: "dumbbell" },
  { name: "activity", href: "/activity", label: "Activity", icon: "flame" },
  { name: "you", href: "/you", label: "You", icon: "user" },
]

/** `/train` and `/train/anything` are the Train destination; `/trainer` is not. */
export const isActivePath = (pathname: string, href: string): boolean =>
  pathname === href || pathname.startsWith(`${href}/`)
