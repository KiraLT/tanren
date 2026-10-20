import type { Href } from "expo-router"

export interface AppNavLink {
  readonly href: Href
  readonly label: string
}

/** The five top-level destinations, in tab order; `AppBar` renders them at `desktop`. */
export const APP_NAV: ReadonlyArray<AppNavLink> = [
  { href: "/today", label: "Today" },
  { href: "/plan", label: "Plan" },
  { href: "/programs", label: "Programs" },
  { href: "/library", label: "Library" },
  { href: "/progress", label: "Progress" },
]

/** `/plan` and `/plan/anything` are the Plan destination; `/planner` is not. */
export const isActivePath = (pathname: string, href: string): boolean =>
  pathname === href || pathname.startsWith(`${href}/`)
