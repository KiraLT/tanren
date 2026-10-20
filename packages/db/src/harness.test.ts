import { env } from "cloudflare:workers"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { D1Layer } from "./client"

describe("test harness", () => {
  it.effect("runs it.effect inside workerd against the migrated D1", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const rows = yield* sql<{
        readonly name: string
      }>`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'workout_set'`
      expect(rows).toEqual([{ name: "workout_set" }])
    }).pipe(Effect.provide(D1Layer(env.DB))),
  )
})
