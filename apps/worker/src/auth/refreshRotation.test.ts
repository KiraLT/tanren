import { describe, expect, it } from "@effect/vitest"
import { alreadyBurned, BURNED } from "@tanren/db"
import { DateTime, Option } from "effect"
import { retainUntil, verdictOf } from "./refreshRotation"
import { CLOCK_SKEW_SECONDS } from "./Tokens"

const NOW = DateTime.makeUnsafe("2026-10-27T12:00:00.000Z")
const ago = (seconds: number) => alreadyBurned(Option.some(DateTime.subtract(NOW, { seconds })))

describe("verdictOf", () => {
  it("a first burn rotates", () => {
    expect(verdictOf(BURNED, NOW)).toBe("rotate")
  })

  it("a re-send 10 s after the first burn is grace", () => {
    expect(verdictOf(ago(10), NOW)).toBe("grace")
  })

  it("a re-send exactly 30 s after the first burn is still grace", () => {
    expect(verdictOf(ago(30), NOW)).toBe("grace")
  })

  it("a re-send 31 s after the first burn is reuse", () => {
    expect(verdictOf(ago(31), NOW)).toBe("reuse")
  })

  it("a burned jti whose burnedAt is unknown is reuse", () => {
    expect(verdictOf(alreadyBurned(Option.none()), NOW)).toBe("reuse")
  })
})

describe("retainUntil", () => {
  it("keeps the row until exp plus the verification clock skew", () => {
    const exp = 1_800_000_000
    expect(Option.map(retainUntil(exp), DateTime.toEpochMillis)).toEqual(
      Option.some((exp + CLOCK_SKEW_SECONDS) * 1000),
    )
  })
})
