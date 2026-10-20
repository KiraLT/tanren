/**
 * Test-only SqlDriver on Node's built-in `node:sqlite` (Node 24), in memory. Never import this
 * from app code: Metro cannot bundle `node:` modules.
 */
import { DatabaseSync } from "node:sqlite"
import { Effect, Layer } from "effect"
import { SqlDriver, StoreError, toRecords } from "./SqlDriver"

const toStoreError = (cause: unknown): StoreError => new StoreError({ cause })

/** A fresh in-memory database per layer build, closed when the layer's scope closes. */
export const nodeSqlDriverLayer = Layer.effect(
  SqlDriver,
  Effect.gen(function* () {
    const db = yield* Effect.acquireRelease(
      Effect.try({ try: () => new DatabaseSync(":memory:"), catch: toStoreError }),
      (opened) => Effect.sync(() => opened.close()),
    )
    const exec = (sql: string) => Effect.try({ try: () => db.exec(sql), catch: toStoreError })
    return SqlDriver.of({
      all: (statement) =>
        Effect.try({
          try: () => db.prepare(statement.sql).all(...statement.params),
          catch: toStoreError,
        }).pipe(Effect.flatMap(toRecords)),
      batch: (statements) =>
        exec("BEGIN").pipe(
          Effect.andThen(
            Effect.try({
              try: () =>
                statements.forEach((statement) => {
                  db.prepare(statement.sql).run(...statement.params)
                }),
              catch: toStoreError,
            }).pipe(Effect.tapError(() => Effect.ignore(exec("ROLLBACK")))),
          ),
          Effect.andThen(exec("COMMIT")),
        ),
    })
  }),
)
