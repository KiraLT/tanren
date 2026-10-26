import { describe, expect, it } from "@effect/vitest"
import { DateTime } from "effect"
import { weekStartOf } from "./progressMath"

// epley1Rm / SetScore / bestSet / markPrs moved to `@tanren/shared` (activity.test.ts).

const vilnius = (iso: string) => DateTime.makeZonedUnsafe(iso, { timeZone: "Europe/Vilnius" })

describe("weekStartOf", () => {
  it("snaps to the local Monday, including Sunday and Monday itself", () => {
    expect(weekStartOf(vilnius("2026-10-21T08:00:00.000Z"))).toBe("2026-10-19") // Wednesday
    expect(weekStartOf(vilnius("2026-10-19T08:00:00.000Z"))).toBe("2026-10-19") // Monday
    expect(weekStartOf(vilnius("2026-10-18T08:00:00.000Z"))).toBe("2026-10-12") // Sunday
    expect(weekStartOf(vilnius("2026-01-01T08:00:00.000Z"))).toBe("2025-12-29") // across a year
  })

  it("uses the local date across the 2026-10-25 DST change (EEST → EET)", () => {
    // 21:30 UTC on Sunday 25 Oct is 23:30 local (UTC+2 after the change): still the old week.
    expect(weekStartOf(vilnius("2026-10-25T21:30:00.000Z"))).toBe("2026-10-19")
    // 22:05 UTC is 00:05 local on Monday 26 Oct: the new week.
    expect(weekStartOf(vilnius("2026-10-25T22:05:00.000Z"))).toBe("2026-10-26")
    // Before the change (UTC+3), 21:30 UTC on Sunday 18 Oct is already Monday 00:30 local.
    expect(weekStartOf(vilnius("2026-10-18T21:30:00.000Z"))).toBe("2026-10-19")
  })
})
