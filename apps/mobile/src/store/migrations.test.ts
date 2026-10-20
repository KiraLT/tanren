import { describe, expect, it } from "@effect/vitest"
import { ROW_KEYS, ROW_TABLE, SYNC_TABLE_ORDER } from "@tanren/shared"
import { Array as Arr, Effect, Order } from "effect"
import { SqlDriver } from "../services/SqlDriver"
import { nodeSqlDriverLayer } from "../services/SqlDriver.testing"
import { MIGRATIONS, migrate, userVersion } from "./migrations"

describe("migrations", () => {
  it.effect("apply idempotently and record the version", () =>
    Effect.gen(function* () {
      const driver = yield* SqlDriver
      yield* migrate(driver)
      yield* migrate(driver)
      expect(yield* userVersion(driver)).toBe(MIGRATIONS.length)
    }).pipe(Effect.provide(nodeSqlDriverLayer)),
  )

  it.effect("create every synced table with the shared row columns plus sync flags", () =>
    Effect.gen(function* () {
      const driver = yield* SqlDriver
      yield* migrate(driver)
      const columns = yield* Effect.forEach(SYNC_TABLE_ORDER, (table) =>
        driver.all({ sql: `PRAGMA table_info("${ROW_TABLE[table]}")`, params: [] }).pipe(
          Effect.map((rows) =>
            Arr.sort(
              rows.map((row) => String(row.name)),
              Order.String,
            ),
          ),
        ),
      )
      expect(columns).toEqual(
        SYNC_TABLE_ORDER.map((table) =>
          Arr.sort([...ROW_KEYS[table], "_dirty", "_rejected"], Order.String),
        ),
      )
    }).pipe(Effect.provide(nodeSqlDriverLayer)),
  )

  it.effect("rolls back a failed batch", () =>
    Effect.gen(function* () {
      const driver = yield* SqlDriver
      yield* migrate(driver)
      const failed = yield* Effect.flip(
        driver.batch([
          {
            sql: `INSERT INTO "sync_state" ("key", "value") VALUES (?, ?)`,
            params: ["cursor", "a"],
          },
          { sql: "NOT SQL", params: [] },
        ]),
      )
      expect(failed._tag).toBe("StoreError")
      const rows = yield* driver.all({ sql: `SELECT * FROM "sync_state"`, params: [] })
      expect(rows).toEqual([])
    }).pipe(Effect.provide(nodeSqlDriverLayer)),
  )
})
