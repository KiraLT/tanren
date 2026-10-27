import type { UserId } from "@tanren/shared"
import { Option } from "effect"

export type GateDecision = "allow" | "sign-in"

export interface GateInputs {
  /** The account on this device: the signed-in user, the dev override, or the stored owner. */
  readonly account: Option.Option<UserId>
  /** Logged sets in the offline store (live rows). */
  readonly localSets: number
  /** The current pathname (`/today`, `/auth/callback`, ...). */
  readonly route: string
}

/** The only routes a device without an account may show: the sign-in flow. */
export const isSignInRoute = (route: string): boolean =>
  route === "/sign-in" || route === "/auth" || route.startsWith("/auth/")

/** The legal pages (ADR-0024): public, so a stranger can read them before signing in. */
export const isPublicRoute = (route: string): boolean => route === "/privacy" || route === "/terms"

/**
 * Sign-in gate (ADR-0019). A device with no account AND no local sets may show only the sign-in
 * flow. Any account (even with an expired session) or any logged set keeps the app usable
 * offline: a stale session is not a gate, an absent account is.
 */
export const gateFor = ({ account, localSets, route }: GateInputs): GateDecision =>
  Option.isSome(account) || localSets > 0 || isSignInRoute(route) || isPublicRoute(route)
    ? "allow"
    : "sign-in"
