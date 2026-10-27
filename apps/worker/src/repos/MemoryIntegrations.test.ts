import { describe, expect, it } from "@effect/vitest"
import { ActivityExportRepo, IntegrationRepo, type IntegrationRow, SealedToken } from "@tanren/db"
import { ActivityExportId, SessionId, UserId, Uuid } from "@tanren/shared"
import { Array as Arr, DateTime, Effect, Option } from "effect"
import { at } from "../sync/fixtures"
import { MemoryIntegrations } from "./MemoryIntegrations"

// Mirrors packages/db ActivityExport.test.ts "Blocked after failed attempts resets attempts to 0".
const T0 = at("2026-10-26T10:00:00.000Z")
const LATER = at("2026-10-26T10:30:00.000Z")
const user = UserId.make("00000000-0000-4000-8000-0000000000c1")
const exportId = ActivityExportId.make("00000000-0000-4000-8000-0000000000c2")

describe("MemoryIntegrations ActivityExportRepo", () => {
  it.effect("Blocked after failed attempts resets attempts to 0; the next failure counts 1", () =>
    Effect.gen(function* () {
      const repo = yield* ActivityExportRepo
      const pending = { reason: "transport", nextAttemptAt: LATER, now: LATER } as const
      const only = Effect.map(repo.list(user, "strava", 5), (rows) =>
        Option.getOrThrow(Arr.head(rows)),
      )
      yield* repo.enqueue([
        {
          id: exportId,
          userId: user,
          provider: "strava",
          sessionId: SessionId.make("00000000-0000-4000-8000-0000000000c3"),
          nextAttemptAt: T0,
          createdAt: T0,
        },
      ])
      yield* repo.settle(exportId, { _tag: "Pending", ...pending })
      yield* repo.settle(exportId, { _tag: "Pending", ...pending })
      yield* repo.settle(exportId, { _tag: "Blocked", ...pending, reason: "app_inactive" })
      expect(yield* only).toMatchObject({ status: "blocked", attempts: 0 })
      yield* repo.settle(exportId, { _tag: "Pending", ...pending })
      expect(yield* only).toMatchObject({ status: "pending", attempts: 1 })
    }).pipe(Effect.provide(MemoryIntegrations.layer)),
  )
})

// Mirrors packages/db Integration.test.ts "IntegrationRepo refresh lease".
describe("MemoryIntegrations IntegrationRepo refresh lease", () => {
  const secondsAfter = (seconds: number) => DateTime.add(T0, { seconds })
  const row = {
    id: Uuid.make("00000000-0000-4000-8000-0000000000c4"),
    userId: user,
    provider: "strava",
    status: "active",
    externalId: "1",
    displayName: "Athlete",
    accessToken: SealedToken.make("v1.iv.a"),
    refreshToken: SealedToken.make("v1.iv.r"),
    expiresAt: LATER,
    scope: "activity:write",
    createdAt: T0,
    updatedAt: T0,
  } satisfies IntegrationRow

  it.effect("grants one lease, refuses a second until it expires or is released", () =>
    Effect.gen(function* () {
      const repo = yield* IntegrationRepo
      yield* repo.upsert(row)
      expect(yield* repo.claimRefresh(row.id, T0, T0, secondsAfter(30))).toBe(true)
      expect(yield* repo.claimRefresh(row.id, T0, secondsAfter(10), secondsAfter(40))).toBe(false)
      expect(yield* repo.claimRefresh(row.id, T0, secondsAfter(31), secondsAfter(61))).toBe(true)
      yield* repo.releaseRefresh(row.id, secondsAfter(61))
      expect(yield* repo.claimRefresh(row.id, T0, secondsAfter(32), secondsAfter(62))).toBe(true)
    }).pipe(Effect.provide(MemoryIntegrations.layer)),
  )

  it.effect("a release with a stale until leaves a newer lease in place", () =>
    Effect.gen(function* () {
      const repo = yield* IntegrationRepo
      yield* repo.upsert(row)
      expect(yield* repo.claimRefresh(row.id, T0, T0, secondsAfter(30))).toBe(true)
      expect(yield* repo.claimRefresh(row.id, T0, secondsAfter(31), secondsAfter(61))).toBe(true)
      yield* repo.releaseRefresh(row.id, secondsAfter(30))
      expect(yield* repo.claimRefresh(row.id, T0, secondsAfter(32), secondsAfter(62))).toBe(false)
    }).pipe(Effect.provide(MemoryIntegrations.layer)),
  )

  it.effect("setTokens frees the lease and a claim on the old version is refused", () =>
    Effect.gen(function* () {
      const repo = yield* IntegrationRepo
      yield* repo.upsert(row)
      expect(yield* repo.claimRefresh(row.id, T0, T0, secondsAfter(30))).toBe(true)
      const rotatedAt = secondsAfter(1)
      yield* repo.setTokens(row.id, {
        access: SealedToken.make("v1.iv.a2"),
        refresh: SealedToken.make("v1.iv.r2"),
        expiresAt: LATER,
        updatedAt: rotatedAt,
      })
      expect(yield* repo.claimRefresh(row.id, T0, secondsAfter(2), secondsAfter(32))).toBe(false)
      expect(yield* repo.claimRefresh(row.id, rotatedAt, secondsAfter(2), secondsAfter(32))).toBe(
        true,
      )
    }).pipe(Effect.provide(MemoryIntegrations.layer)),
  )
})
