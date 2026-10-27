import { describe, expect, it } from "vitest"
import { formatVolume } from "./volumeFormat"

describe("formatVolume", () => {
  it("groups thousands of volume", () => {
    expect(formatVolume(4230)).toBe("4,230 kg")
    expect(formatVolume(1000)).toBe("1,000 kg")
    expect(formatVolume(1234567)).toBe("1,234,567 kg")
  })

  it("rounds to whole kilograms and prints zero plainly", () => {
    expect(formatVolume(950.4)).toBe("950 kg")
    expect(formatVolume(999.4)).toBe("999 kg")
    expect(formatVolume(0)).toBe("0 kg")
  })
})
