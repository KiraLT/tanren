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

/** The five top-level destinations, in tab order; the tab bar and `AppBar` (at `desktop`) render them. */
export const APP_NAV: ReadonlyArray<AppNavLink> = [
  { name: "today", href: "/today", label: "Today", icon: "zap" },
  { name: "plan", href: "/plan", label: "Plan", icon: "calendar" },
  { name: "programs", href: "/programs", label: "Programs", icon: "grid" },
  { name: "library", href: "/library", label: "Library", icon: "book" },
  { name: "progress", href: "/progress", label: "Progress", icon: "chart" },
]

/** `/plan` and `/plan/anything` are the Plan destination; `/planner` is not. */
export const isActivePath = (pathname: string, href: string): boolean =>
  pathname === href || pathname.startsWith(`${href}/`)
