import { describe, expect, it } from "@effect/vitest"
import { DateTime, Option } from "effect"
import { at, session, T0, userA } from "../sync/fixtures"
import {
  completedSessionIds,
  EXPORT_BACKFILL_HOURS,
  failureOutcome,
  MAX_ATTEMPTS,
  nextAttempt,
} from "./ExportQueue"

const NOW = at("2026-10-26T12:00:00.000Z")
const plus = (minutes: number) => Option.some(DateTime.add(NOW, { minutes }))

describe("nextAttempt", () => {
  it("backs off +1 m, +5 m, +30 m, +2 h after failed attempts 1 to 4", () => {
    expect([1, 2, 3, 4].map((n) => nextAttempt(n, NOW))).toEqual([
      plus(1),
      plus(5),
      plus(30),
      plus(120),
    ])
  })

  it("gives up (None = dead) from the fifth failed attempt", () => {
    expect(MAX_ATTEMPTS).toBe(5)
    expect(nextAttempt(5, NOW)).toEqual(Option.none())
    expect(nextAttempt(6, NOW)).toEqual(Option.none())
  })
})

describe("failureOutcome", () => {
  it("retries transport, provider_error and rate_limited as pending with the backoff", () => {
    expect(failureOutcome("transport", 1, NOW)).toEqual({
      _tag: "Pending",
      reason: "transport",
      nextAttemptAt: DateTime.add(NOW, { minutes: 1 }),
      now: NOW,
    })
    expect(failureOutcome("rate_limited", 2, NOW)).toMatchObject({ _tag: "Pending" })
    expect(failureOutcome("provider_error", 5, NOW)).toEqual({
      _tag: "Dead",
      reason: "provider_error",
      now: NOW,
    })
  })

  it("fails rejected at once and kills session_missing at once", () => {
    expect(failureOutcome("rejected", 1, NOW)).toEqual({
      _tag: "Failed",
      reason: "rejected",
      now: NOW,
    })
    expect(failureOutcome("session_missing", 1, NOW)).toEqual({
      _tag: "Dead",
      reason: "session_missing",
      now: NOW,
    })
  })

  it("blocks app_inactive for 12 h whatever the attempt count, never dead", () => {
    expect([1, 5, 50].map((n) => failureOutcome("app_inactive", n, NOW))).toEqual(
      [1, 5, 50].map(() => ({
        _tag: "Blocked",
        reason: "app_inactive",
        nextAttemptAt: DateTime.add(NOW, { hours: 12 }),
        now: NOW,
      })),
    )
  })
})

describe("completedSessionIds", () => {
  const done = (n: number, deleted = false) => ({
    table: "session" as const,
    row: { ...session(n, T0, deleted), finishedAt: Option.some(NOW) },
  })
  const accepted = (n: number) => ({
    table: "session" as const,
    id: session(n, T0).id,
    updatedAt: T0,
  })

  it("keeps accepted finished live sessions and skips open, deleted and unaccepted ones", () => {
    const open = { table: "session" as const, row: session(2, T0) }
    const ids = completedSessionIds(
      [done(1), open, done(3, true), done(4)],
      [accepted(1), accepted(2), accepted(3)],
    )
    expect(ids).toEqual([session(1, T0).id])
    expect(userA).toBe(session(1, T0).userId)
  })

  it("skips a session finished more than EXPORT_BACKFILL_HOURS before it was completed", () => {
    const finishedAt = (n: number, hoursBefore: number) => ({
      table: "session" as const,
      row: {
        ...session(n, T0),
        finishedAt: Option.some(DateTime.subtract(NOW, { hours: hoursBefore })),
      },
    })
    const acceptedAtNow = (n: number) => ({ ...accepted(n), updatedAt: NOW })
    const ids = completedSessionIds(
      [finishedAt(1, EXPORT_BACKFILL_HOURS), finishedAt(2, EXPORT_BACKFILL_HOURS + 1)],
      [acceptedAtNow(1), acceptedAtNow(2)],
    )
    expect(ids).toEqual([session(1, T0).id])
  })
})
