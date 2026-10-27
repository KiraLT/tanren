import { describe, expect, it } from "@effect/vitest"
import { LocalDate } from "@tanren/shared"
import { DateTime, Effect } from "effect"
import { addDays, dayRange, localDayOf, localHourOf, weekOf, zoneOf } from "./localDate"

const at = (iso: string) => DateTime.makeUnsafe(iso)

describe("localDate", () => {
  it.effect("an instant at 23:30 local in a non-UTC zone is that local day", () =>
    Effect.gen(function* () {
      // 23:30 in Vilnius (EET, UTC+2 on 2026-10-27) = 21:30Z.
      const now = at("2026-10-27T21:30:00.000Z")
      expect(yield* localDayOf(now, "Europe/Vilnius")).toBe("2026-10-27")
      expect(localHourOf(now, "Europe/Vilnius")).toBe(23)
      // Same instant in Tokyo (+9) is already the 28th.
      expect(yield* localDayOf(now, "Asia/Tokyo")).toBe("2026-10-28")
    }),
  )

  it.effect("an unknown zone falls back to UTC", () =>
    Effect.gen(function* () {
      expect(DateTime.zoneToString(zoneOf("Not/AZone"))).toBe("+00:00")
      const now = at("2026-10-27T23:30:00.000Z")
      expect(yield* localDayOf(now, "Not/AZone")).toBe("2026-10-27")
      expect(localHourOf(now, "")).toBe(23)
      const range = yield* dayRange(LocalDate.make("2026-10-27"), "Not/AZone")
      expect(DateTime.formatIso(range.from)).toBe("2026-10-27T00:00:00.000Z")
      expect(DateTime.formatIso(range.to)).toBe("2026-10-28T00:00:00.000Z")
    }),
  )

  it.effect("a local day is [local midnight, next local midnight) in UTC", () =>
    Effect.gen(function* () {
      const range = yield* dayRange(LocalDate.make("2026-10-27"), "Europe/Vilnius")
      expect(DateTime.formatIso(range.from)).toBe("2026-10-26T22:00:00.000Z")
      expect(DateTime.formatIso(range.to)).toBe("2026-10-27T22:00:00.000Z")
    }),
  )

  it.effect("the DST-change day is 25 hours long and its week still has 7 Mon–Sun dates", () =>
    Effect.gen(function* () {
      // Europe/Vilnius leaves summer time on Sunday 2026-10-25 (04:00 +03 → 03:00 +02).
      const range = yield* dayRange(LocalDate.make("2026-10-25"), "Europe/Vilnius")
      expect(DateTime.formatIso(range.from)).toBe("2026-10-24T21:00:00.000Z")
      expect(DateTime.formatIso(range.to)).toBe("2026-10-25T22:00:00.000Z")
      expect(yield* weekOf(LocalDate.make("2026-10-25"))).toEqual([
        "2026-10-19",
        "2026-10-20",
        "2026-10-21",
        "2026-10-22",
        "2026-10-23",
        "2026-10-24",
        "2026-10-25",
      ])
    }),
  )

  it.effect("the week of a Thursday starts on the Monday before; Monday maps to itself", () =>
    Effect.gen(function* () {
      const week = yield* weekOf(LocalDate.make("2026-10-29"))
      expect(week[0]).toBe("2026-10-26")
      expect(week[6]).toBe("2026-11-01")
      expect((yield* weekOf(LocalDate.make("2026-10-26")))[0]).toBe("2026-10-26")
      expect(yield* addDays(LocalDate.make("2026-12-31"), 1)).toBe("2027-01-01")
      expect(yield* addDays(LocalDate.make("2028-03-01"), -1)).toBe("2028-02-29")
    }),
  )
})
