import { describe, expect, it } from "@effect/vitest"
import { Session, SessionId, UserId } from "@tanren/shared"
import { DateTime, Option } from "effect"
import { canFinish, finishedLine } from "./finishWorkoutText"

const AT = DateTime.makeUnsafe("2026-10-26T18:00:00.000Z")
const sessionId = SessionId.make("00000000-0000-4000-8000-000000000001")

const session = (finishedAt: Option.Option<DateTime.Utc>) =>
  new Session({
    id: sessionId,
    userId: UserId.make("00000000-0000-4000-8000-0000000000aa"),
    createdAt: AT,
    updatedAt: AT,
    deletedAt: Option.none(),
    startedAt: AT,
    finishedAt,
    plannedSessionId: Option.none(),
    notes: Option.none(),
  })

describe("canFinish", () => {
  it("is true for an open session with one logged set", () => {
    expect(canFinish(Option.some({ session: session(Option.none()), setCount: 1 }))).toBe(true)
  })

  it("is false before the first set, with zero sets, or once finished", () => {
    expect(canFinish(Option.none())).toBe(false)
    expect(canFinish(Option.some({ session: session(Option.none()), setCount: 0 }))).toBe(false)
    expect(canFinish(Option.some({ session: session(Option.some(AT)), setCount: 3 }))).toBe(false)
  })
})

describe("finishedLine", () => {
  it("reads sets and the feed's duration", () => {
    expect(finishedLine({ sessionId, setCount: 5, durationSeconds: 48 * 60 + 30 })).toBe(
      "Workout saved · 5 sets · 48 min",
    )
  })

  it("uses the singular for one set", () => {
    expect(finishedLine({ sessionId, setCount: 1, durationSeconds: 30 })).toBe(
      "Workout saved · 1 set · < 1 min",
    )
  })
})
