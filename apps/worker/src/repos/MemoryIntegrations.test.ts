import { describe, expect, it } from "@effect/vitest"
import { ActivityExportRepo } from "@tanren/db"
import { ActivityExportId, SessionId, UserId } from "@tanren/shared"
import { Array as Arr, Effect, Option } from "effect"
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
