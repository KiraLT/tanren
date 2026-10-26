import { describe, expect, it } from "@effect/vitest"
import { Activity, SessionId } from "@tanren/shared"
import { Option, Schema } from "effect"
import { effectiveActivity } from "./feedSelection"

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`

const activityOf = (n: number): Activity =>
  Schema.decodeUnknownSync(Activity)({
    sessionId: uuid(n),
    kind: "free",
    status: "done",
    title: `Workout ${n}`,
    startedAt: "2026-10-26T16:40:00.000Z",
    durationSeconds: 2880,
    sets: 0,
    reps: 0,
    volumeKg: 0,
    prs: 0,
    program: null,
    exercises: [],
    muscles: { primary: [], secondary: [] },
  })

const id = (n: number): SessionId => SessionId.make(uuid(n))
const newest = activityOf(1)
const older = activityOf(2)
const list = [newest, older]

describe("effectiveActivity", () => {
  it("keeps the user's pick while it is in the list", () => {
    const shown = effectiveActivity(list, Option.some(id(2)))
    expect(Option.map(shown, (a) => a.sessionId)).toEqual(Option.some(id(2)))
  })

  it("falls back to the newest when the pick vanished", () => {
    const shown = effectiveActivity(list, Option.some(id(99)))
    expect(Option.map(shown, (a) => a.sessionId)).toEqual(Option.some(id(1)))
  })

  it("defaults to the newest without a pick", () => {
    const shown = effectiveActivity(list, Option.none())
    expect(Option.map(shown, (a) => a.sessionId)).toEqual(Option.some(id(1)))
  })

  it("is None for an empty list", () => {
    expect(Option.isNone(effectiveActivity([], Option.some(id(1))))).toBe(true)
    expect(Option.isNone(effectiveActivity([], Option.none()))).toBe(true)
  })
})
