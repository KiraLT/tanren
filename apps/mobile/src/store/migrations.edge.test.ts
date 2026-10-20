import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Result } from "effect"
import { LocalStore } from "../services/LocalStore"
import { SqlDriver } from "../services/SqlDriver"
import { nodeSqlDriverLayer } from "../services/SqlDriver.testing"
import { StoreEvents } from "../services/StoreEvents"
import { MIGRATIONS, migrate, userVersion } from "./migrations"

const exec = (sql: string) => SqlDriver.use((driver) => driver.batch([{ sql, params: [] }]))

describe("migrations on odd databases", () => {
  it.effect("a database from a newer app (user_version ahead) is left alone", () =>
    Effect.gen(function* () {
      const driver = yield* SqlDriver
      yield* exec(`PRAGMA user_version = 99`)
      yield* migrate(driver)
      expect(yield* userVersion(driver)).toBe(99)
    }).pipe(Effect.provide(nodeSqlDriverLayer)),
  )

  it.effect("migrating twice is a no-op", () =>
    Effect.gen(function* () {
      const driver = yield* SqlDriver
      yield* migrate(driver)
      yield* migrate(driver)
      expect(yield* userVersion(driver)).toBe(MIGRATIONS.length)
    }).pipe(Effect.provide(nodeSqlDriverLayer)),
  )

  it.effect("a half-created schema fails the layer with a typed StoreError, not a defect", () =>
    Effect.gen(function* () {
      const driverContext = yield* Layer.build(nodeSqlDriverLayer)
      yield* exec(`CREATE TABLE "exercise" ("id" TEXT PRIMARY KEY NOT NULL)`).pipe(
        Effect.provide(driverContext),
      )
      const built = yield* Effect.result(
        Layer.build(
          LocalStore.layerNoDeps.pipe(
            Layer.provide(Layer.mergeAll(Layer.succeedContext(driverContext), StoreEvents.layer)),
          ),
        ),
      )
      expect(Result.isFailure(built) && built.failure._tag).toBe("StoreError")
    }),
  )
})
