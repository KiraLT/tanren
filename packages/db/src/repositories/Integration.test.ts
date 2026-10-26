import { describe, expect, it } from "@effect/vitest"
import { ActivityExportId, SessionId, UserId } from "@tanren/shared"
import { DateTime, Effect, Option } from "effect"
import { TestLayer } from "../testing/fixtures"
import { ActivityExportRepo } from "./ActivityExport"
import { IntegrationRepo, type IntegrationRow, SealedToken } from "./Integration"

const uuid = (prefix: number, n: number) =>
  `${prefix.toString().padStart(8, "0")}-0000-4000-8000-${n.toString().padStart(12, "0")}`
const userOf = (n: number) => UserId.make(uuid(80, n))
const time = (iso: string) => DateTime.makeUnsafe(iso)
const T0 = time("2026-10-26T10:00:00.000Z")
const T1 = time("2026-10-26T11:00:00.000Z")

const row = (
  n: number,
  userId: UserId,
  overrides: Partial<IntegrationRow> = {},
): IntegrationRow => ({
  id: uuid(81, n),
  userId,
  provider: "strava",
  status: "active",
  externalId: "12345",
  displayName: "Lukas K.",
  accessToken: SealedToken.make("v1.iv.access"),
  refreshToken: SealedToken.make("v1.iv.refresh"),
  expiresAt: time("2026-10-26T16:00:00.000Z"),
  scope: "read,activity:write",
  createdAt: T0,
  updatedAt: T0,
  ...overrides,
})

describe("IntegrationRepo", () => {
  it.effect("get is None before an upsert and Some after, per user", () =>
    Effect.gen(function* () {
      const repo = yield* IntegrationRepo
      const user = userOf(1)
      expect(yield* repo.get(user, "strava")).toEqual(Option.none())
      const stored = row(1, user)
      yield* repo.upsert(stored)
      expect(yield* repo.get(user, "strava")).toEqual(Option.some(stored))
      expect(yield* repo.get(userOf(2), "strava")).toEqual(Option.none())
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("upsert twice on (user, provider) keeps one row and reactivates it", () =>
    Effect.gen(function* () {
      const repo = yield* IntegrationRepo
      const user = userOf(3)
      const first = row(3, user)
      yield* repo.upsert(first)
      yield* repo.markRevoked(first.id, T0, T1)
      const reconnect = row(4, user, {
        externalId: "99999",
        displayName: "New Name",
        accessToken: SealedToken.make("v1.iv.access2"),
        refreshToken: SealedToken.make("v1.iv.refresh2"),
        createdAt: T1,
        updatedAt: T1,
      })
      yield* repo.upsert(reconnect)
      const stored = yield* repo.get(user, "strava")
      expect(stored).toEqual(
        Option.some({ ...reconnect, id: first.id, createdAt: first.createdAt }),
      )
      expect(Option.map(stored, (s) => s.status)).toEqual(Option.some("active"))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("setTokens replaces both sealed tokens and the expiry together", () =>
    Effect.gen(function* () {
      const repo = yield* IntegrationRepo
      const user = userOf(5)
      const stored = row(5, user)
      yield* repo.upsert(stored)
      const expiresAt = time("2026-10-26T22:00:00.000Z")
      yield* repo.setTokens(stored.id, {
        access: SealedToken.make("v1.iv.newaccess"),
        refresh: SealedToken.make("v1.iv.newrefresh"),
        expiresAt,
        updatedAt: T1,
      })
      expect(yield* repo.get(user, "strava")).toEqual(
        Option.some({
          ...stored,
          accessToken: SealedToken.make("v1.iv.newaccess"),
          refreshToken: SealedToken.make("v1.iv.newrefresh"),
          expiresAt,
          updatedAt: T1,
        }),
      )
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("markRevoked flips the status and stamps updatedAt, nothing else", () =>
    Effect.gen(function* () {
      const repo = yield* IntegrationRepo
      const user = userOf(6)
      const stored = row(6, user)
      yield* repo.upsert(stored)
      yield* repo.markRevoked(stored.id, T0, T1)
      expect(yield* repo.get(user, "strava")).toEqual(
        Option.some({ ...stored, status: "revoked", updatedAt: T1 }),
      )
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("markRevoked of a row version rotated meanwhile is a no-op", () =>
    Effect.gen(function* () {
      const repo = yield* IntegrationRepo
      const user = userOf(9)
      const stored = row(9, user)
      yield* repo.upsert(stored)
      const rotated = {
        access: SealedToken.make("v1.iv.access-rotated"),
        refresh: SealedToken.make("v1.iv.refresh-rotated"),
        expiresAt: time("2026-10-26T17:00:00.000Z"),
        updatedAt: T1,
      }
      yield* repo.setTokens(stored.id, rotated)
      yield* repo.markRevoked(stored.id, T0, time("2026-10-26T12:00:00.000Z"))
      expect(yield* repo.get(user, "strava")).toEqual(
        Option.some({
          ...stored,
          accessToken: rotated.access,
          refreshToken: rotated.refresh,
          expiresAt: rotated.expiresAt,
          updatedAt: T1,
        }),
      )
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("remove deletes the integration and that user's exports, not another user's", () =>
    Effect.gen(function* () {
      const repo = yield* IntegrationRepo
      const exports = yield* ActivityExportRepo
      const mine = userOf(7)
      const theirs = userOf(8)
      yield* repo.upsert(row(7, mine))
      yield* repo.upsert(row(8, theirs))
      const queued = (n: number, userId: UserId) => ({
        id: ActivityExportId.make(uuid(82, n)),
        userId,
        provider: "strava" as const,
        sessionId: SessionId.make(uuid(83, n)),
        nextAttemptAt: T0,
        createdAt: T0,
      })
      yield* exports.enqueue([queued(7, mine), queued(8, theirs)])
      yield* repo.remove(mine, "strava")
      expect(yield* repo.get(mine, "strava")).toEqual(Option.none())
      expect(yield* exports.list(mine, "strava", 10)).toEqual([])
      expect(Option.isSome(yield* repo.get(theirs, "strava"))).toBe(true)
      expect((yield* exports.list(theirs, "strava", 10)).length).toBe(1)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("remove on a user without a connection succeeds", () =>
    Effect.gen(function* () {
      const repo = yield* IntegrationRepo
      yield* repo.remove(userOf(9), "strava")
      expect(yield* repo.get(userOf(9), "strava")).toEqual(Option.none())
    }).pipe(Effect.provide(TestLayer)),
  )
})
