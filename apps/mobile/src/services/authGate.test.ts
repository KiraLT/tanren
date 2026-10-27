import { describe, expect, it } from "@effect/vitest"
import { UserId } from "@tanren/shared"
import { Option } from "effect"
import { gateFor, isPublicRoute, isSignInRoute } from "./authGate"
import { parseDevUserId } from "./CurrentUser"

const USER = UserId.make("00000000-0000-4000-8000-0000000000aa")
const none = Option.none<UserId>()

describe("gateFor", () => {
  it("gates a device with no account and no sets", () => {
    const routes = ["/", "/home", "/activity", "/you", "/settings", "/train", "/programs/play"]
    expect(routes.map((route) => gateFor({ account: none, localSets: 0, route }))).toEqual(
      routes.map(() => "sign-in"),
    )
  })

  it("allows an account with no sets (a new or expired session keeps the app usable)", () => {
    expect(gateFor({ account: Option.some(USER), localSets: 0, route: "/home" })).toBe("allow")
  })

  it("allows no account with local sets (signed out, data kept)", () => {
    expect(gateFor({ account: none, localSets: 3, route: "/home" })).toBe("allow")
  })

  it("allows an account with sets", () => {
    expect(gateFor({ account: Option.some(USER), localSets: 3, route: "/activity" })).toBe("allow")
  })

  it("gates an unknown path like any app route (the not-found redirect never skips the gate)", () => {
    expect(gateFor({ account: none, localSets: 0, route: "/no-such-page" })).toBe("sign-in")
    expect(gateFor({ account: Option.some(USER), localSets: 0, route: "/no-such-page" })).toBe(
      "allow",
    )
  })

  it("always allows the sign-in flow", () => {
    const routes = ["/sign-in", "/auth/callback", "/auth"]
    expect(routes.map((route) => gateFor({ account: none, localSets: 0, route }))).toEqual(
      routes.map(() => "allow"),
    )
  })

  it("allows the public legal pages with no account and no sets", () => {
    const routes = ["/privacy", "/terms"]
    expect(routes.map((route) => gateFor({ account: none, localSets: 0, route }))).toEqual(
      routes.map(() => "allow"),
    )
    expect(routes.map(isPublicRoute)).toEqual([true, true])
  })

  it("does not treat look-alike routes as public", () => {
    const routes = ["/privacyx", "/privacy/x", "/terms-of", "/term"]
    expect(routes.map(isPublicRoute)).toEqual(routes.map(() => false))
    expect(gateFor({ account: none, localSets: 0, route: "/privacyx" })).toBe("sign-in")
  })

  it("does not treat look-alike routes as sign-in", () => {
    expect(isSignInRoute("/sign-in-now")).toBe(false)
    expect(isSignInRoute("/authors")).toBe(false)
    expect(gateFor({ account: none, localSets: 0, route: "/authors" })).toBe("sign-in")
  })

  it("counts the dev override (EXPO_PUBLIC_DEV_USER_ID) as an account", () => {
    const account = parseDevUserId(USER)
    expect(gateFor({ account, localSets: 0, route: "/home" })).toBe("allow")
    expect(gateFor({ account: parseDevUserId("nope"), localSets: 0, route: "/home" })).toBe(
      "sign-in",
    )
  })
})
