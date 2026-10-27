import { describe, expect, it } from "@effect/vitest"
import { ROW_KEYS, ROW_TABLE, SYNC_TABLE_ORDER } from "@tanren/shared"
import { Array as Arr, Effect, Order } from "effect"
import { SqlDriver } from "../services/SqlDriver"
import { nodeSqlDriverLayer } from "../services/SqlDriver.testing"
import { MIGRATIONS, migrate, userVersion } from "./migrations"

const columnsOf = (table: string) =>
  SqlDriver.use((driver) => driver.all({ sql: `PRAGMA table_info("${table}")`, params: [] })).pipe(
    Effect.map((rows) => rows.map((row) => String(row.name))),
  )

describe("migrations v2", () => {
  it.effect("adds catalogId to exercise", () =>
    Effect.gen(function* () {
      yield* SqlDriver.use(migrate)
      expect(yield* columnsOf("exercise")).toContain("catalogId")
    }).pipe(Effect.provide(nodeSqlDriverLayer)),
  )

  it.effect("creates program_enrollment and program_day_completion with the design columns", () =>
    Effect.gen(function* () {
      yield* SqlDriver.use(migrate)
      const sync = ["createdAt", "updatedAt", "deletedAt", "_dirty", "_rejected"]
      expect(yield* columnsOf("program_enrollment")).toEqual([
        "id",
        "userId",
        "programId",
        "startedOn",
        "status",
        "currentDay",
        ...sync,
      ])
      expect(yield* columnsOf("program_day_completion")).toEqual([
        "id",
        "userId",
        "enrollmentId",
        "dayNumber",
        "completedAt",
        "durationSeconds",
        "sessionId",
        ...sync,
      ])
    }).pipe(Effect.provide(nodeSqlDriverLayer)),
  )

  it.effect("upgrades a v1 store in place, keeping rows and leaving catalogId null", () =>
    Effect.gen(function* () {
      const driver = yield* SqlDriver
      const [v1] = MIGRATIONS
      yield* driver.batch([
        ...(v1 ?? []).map((sql) => ({ sql, params: [] })),
        { sql: "PRAGMA user_version = 1", params: [] },
        {
          sql: `INSERT INTO "exercise" ("id", "userId", "name", "aliases", "muscleGroups", "createdAt", "updatedAt")
            VALUES ('e1', 'u1', 'Squat', '[]', '[]', 't', 't')`,
          params: [],
        },
      ])
      yield* migrate(driver)
      expect(yield* userVersion(driver)).toBe(MIGRATIONS.length)
      const rows = yield* driver.all({
        sql: `SELECT "name", "catalogId" FROM "exercise"`,
        params: [],
      })
      expect(rows).toEqual([{ name: "Squat", catalogId: null }])
    }).pipe(Effect.provide(nodeSqlDriverLayer)),
  )
})

describe("migrations v3", () => {
  it.effect("upgrades a v2 store in place: profile rows get no locations and no active one", () =>
    Effect.gen(function* () {
      const driver = yield* SqlDriver
      const [v1, v2] = MIGRATIONS
      yield* driver.batch([
        ...[...(v1 ?? []), ...(v2 ?? [])].map((sql) => ({ sql, params: [] })),
        { sql: "PRAGMA user_version = 2", params: [] },
        {
          sql: `INSERT INTO "profile" ("id", "userId", "goals", "constraints", "availableDays", "equipment", "timezone", "createdAt", "updatedAt")
            VALUES ('u1', 'u1', '[]', '[]', '[]', '[]', 'Europe/Vilnius', 't', 't')`,
          params: [],
        },
      ])
      yield* migrate(driver)
      expect(yield* userVersion(driver)).toBe(MIGRATIONS.length)
      const rows = yield* driver.all({
        sql: `SELECT "locations", "activeLocationId" FROM "profile"`,
        params: [],
      })
      expect(rows).toEqual([{ locations: "[]", activeLocationId: null }])
    }).pipe(Effect.provide(nodeSqlDriverLayer)),
  )
})

describe("migrations v4", () => {
  const indexesOf = (table: string) =>
    SqlDriver.use((driver) =>
      driver.all({ sql: `PRAGMA index_list("${table}")`, params: [] }),
    ).pipe(Effect.map((rows) => rows.map((row) => String(row.name))))

  it.effect("creates imported_activity and daily_health with their indexes", () =>
    Effect.gen(function* () {
      const driver = yield* SqlDriver
      yield* migrate(driver)
      expect(MIGRATIONS.length).toBe(4)
      expect(yield* userVersion(driver)).toBe(4)
      const sync = ["createdAt", "updatedAt", "deletedAt", "_dirty", "_rejected"]
      expect(yield* columnsOf("imported_activity")).toEqual([
        "id",
        "userId",
        "provider",
        "externalId",
        "sport",
        "title",
        "startedAt",
        "durationSeconds",
        "distanceMeters",
        "calories",
        "avgHeartRate",
        "maxHeartRate",
        ...sync,
      ])
      expect(yield* columnsOf("daily_health")).toEqual([
        "id",
        "userId",
        "provider",
        "date",
        "totalCalories",
        "activeCalories",
        "steps",
        "restingHeartRate",
        ...sync,
      ])
      expect(yield* indexesOf("imported_activity")).toEqual(
        expect.arrayContaining(["imported_activity_started", "imported_activity_dirty"]),
      )
      expect(yield* indexesOf("daily_health")).toEqual(
        expect.arrayContaining(["daily_health_date", "daily_health_dirty"]),
      )
    }).pipe(Effect.provide(nodeSqlDriverLayer)),
  )

  it.effect("upgrades a v3 store in place, keeping its rows", () =>
    Effect.gen(function* () {
      const driver = yield* SqlDriver
      yield* driver.batch([
        ...MIGRATIONS.slice(0, 3)
          .flat()
          .map((sql) => ({ sql, params: [] })),
        { sql: "PRAGMA user_version = 3", params: [] },
        {
          sql: `INSERT INTO "exercise" ("id", "userId", "name", "aliases", "muscleGroups", "createdAt", "updatedAt")
            VALUES ('e1', 'u1', 'Squat', '[]', '[]', 't', 't')`,
          params: [],
        },
      ])
      yield* migrate(driver)
      expect(yield* userVersion(driver)).toBe(4)
      expect(yield* driver.all({ sql: `SELECT "name" FROM "exercise"`, params: [] })).toEqual([
        { name: "Squat" },
      ])
      expect(yield* driver.all({ sql: `SELECT * FROM "daily_health"`, params: [] })).toEqual([])
    }).pipe(Effect.provide(nodeSqlDriverLayer)),
  )
})

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
