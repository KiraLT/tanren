import { describe, expect, it } from "@effect/vitest"
import { UserId } from "@tanren/shared"
import { Array as Arr, Effect, Layer, Option, Ref, Result } from "effect"
import { FetchHttpClient } from "effect/http"
import { OWNER_USER_ID_KEY } from "../store/syncQueries"
import { AccountErasure, listLocalTables, wipeStatements } from "./AccountErasure"
import { LocalStore } from "./LocalStore"
import { NativeSession } from "./NativeSession"
import { SqlDriver, type SqlDriverShape, StoreError } from "./SqlDriver"
import { nodeSqlDriverLayer } from "./SqlDriver.testing"
import { StoreEvents } from "./StoreEvents"

const USER = UserId.make("00000000-0000-4000-8000-0000000000ee")
const TOKENS = {
  "tanren.access": "tok-1",
  "tanren.refresh": "ref-1",
  "tanren.expiresAt": "2099-01-01T00:00:00.000Z",
}

interface Seen {
  readonly method: string
  readonly url: string
  readonly authorization: string | null
}

const tableNames = (driver: SqlDriverShape) =>
  driver
    .all(listLocalTables)
    .pipe(Effect.map(Arr.flatMap((row) => (typeof row.name === "string" ? [row.name] : []))))

/** Rows per table, by the same `sqlite_master` enumeration the service uses. */
const counts = (driver: SqlDriverShape) =>
  Effect.gen(function* () {
    const names = yield* tableNames(driver)
    return Object.fromEntries(
      yield* Effect.forEach(names, (name) =>
        driver
          .all({ sql: `SELECT count(*) AS n FROM "${name}"`, params: [] })
          .pipe(Effect.map((rows) => [name, Number(rows[0]?.n ?? -1)] as const)),
      ),
    )
  })

/**
 * One row in every migrated table (each column set to '1': the local store has no foreign keys),
 * plus the owner in `sync_state`; a table whose constraints refuse the placeholder stays empty.
 */
const seedEveryTable = (driver: SqlDriverShape) =>
  Effect.gen(function* () {
    const names = yield* tableNames(driver)
    yield* Effect.forEach(names, (name) =>
      driver.all({ sql: `SELECT "name" FROM pragma_table_info(?)`, params: [name] }).pipe(
        Effect.flatMap((columns) => {
          const cols = Arr.flatMap(columns, (c) => (typeof c.name === "string" ? [c.name] : []))
          return driver.batch([
            {
              sql: `INSERT INTO "${name}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
              params: cols.map((c) => (c === "key" ? `seed-${name}` : "1")),
            },
          ])
        }),
        Effect.ignore,
      ),
    )
    yield* driver.batch([
      {
        sql: `INSERT OR REPLACE INTO "sync_state" ("key", "value") VALUES (?, ?)`,
        params: [OWNER_USER_ID_KEY, USER],
      },
    ])
  })

/** node:sqlite whose `batch` fails for the wipe (`DELETE FROM …`) only; seeding still works. */
const wipeFailsDriver = Layer.effect(
  SqlDriver,
  Effect.gen(function* () {
    const real = yield* SqlDriver
    return SqlDriver.of({
      ...real,
      batch: (statements) =>
        statements.some((statement) => statement.sql.startsWith("DELETE FROM"))
          ? Effect.fail(new StoreError({ cause: "disk full" }))
          : real.batch(statements),
    })
  }),
).pipe(Layer.provide(nodeSqlDriverLayer))

const scenario = (
  respond: (seen: Seen) => Promise<Response>,
  options: { readonly failWipe?: boolean } = {},
) =>
  Effect.gen(function* () {
    const kv = yield* Ref.make<Readonly<Record<string, string>>>(TOKENS)
    const calls = yield* Ref.make<ReadonlyArray<Seen>>([])
    const fetch: typeof globalThis.fetch = (input, init) => {
      const request = new Request(input, init)
      const seen = {
        method: request.method,
        url: request.url,
        authorization: request.headers.get("authorization"),
      }
      Effect.runSync(Ref.update(calls, Arr.append(seen)))
      return respond(seen)
    }
    const layer = AccountErasure.layerWith(Effect.succeed("http://api.test")).pipe(
      Layer.provideMerge(
        Layer.mergeAll(
          LocalStore.layerNoDeps.pipe(
            Layer.provideMerge(
              Layer.mergeAll(
                options.failWipe === true ? wipeFailsDriver : nodeSqlDriverLayer,
                StoreEvents.layer,
              ),
            ),
          ),
          NativeSession.layerMemory(kv),
          FetchHttpClient.layer,
        ),
      ),
    )
    return yield* Effect.gen(function* () {
      const driver = yield* SqlDriver
      yield* seedEveryTable(driver)
      const before = yield* counts(driver)
      const result = yield* AccountErasure.use((service) => service.erase).pipe(Effect.result)
      const owner = yield* driver.all({ sql: `SELECT * FROM "sync_state"`, params: [] })
      return {
        before,
        after: yield* counts(driver),
        result,
        owner,
        calls: yield* Ref.get(calls),
        tokens: yield* Ref.get(kv),
      }
    }).pipe(Effect.provide(layer), Effect.provideService(FetchHttpClient.Fetch, fetch))
  })

const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  )

describe("AccountErasure", () => {
  it.effect("deletes on the server, then empties every local table and clears the tokens", () =>
    Effect.gen(function* () {
      const run = yield* scenario(() => json({ deleted: true }))
      expect(Result.isSuccess(run.result)).toBe(true)
      expect(run.calls).toEqual([
        {
          method: "POST",
          url: "http://api.test/api/account/delete",
          authorization: "Bearer tok-1",
        },
      ])
      // The seed reached most tables (proof the "all zero" below is not vacuous).
      expect(Object.values(run.before).filter((n) => n > 0).length).toBeGreaterThan(5)
      expect(Object.values(run.after).every((n) => n === 0)).toBe(true)
      expect(Object.keys(run.after)).toContain("sync_state")
      expect(run.owner).toEqual([])
      expect(run.tokens).toEqual({})
    }),
  )

  it.effect("a server error changes nothing local", () =>
    Effect.gen(function* () {
      const run = yield* scenario(() => json({ error: "x" }, 500))
      expect(Result.isFailure(run.result) && run.result.failure.reason).toBe("server")
      expect(run.after).toEqual(run.before)
      expect(Option.fromNullishOr(run.tokens["tanren.access"])).toEqual(Option.some("tok-1"))
    }),
  )

  it.effect("a 401 (not signed in) is a server failure and keeps local data", () =>
    Effect.gen(function* () {
      const run = yield* scenario(() => json({}, 401))
      expect(Result.isFailure(run.result) && run.result.failure.reason).toBe("server")
      expect(run.after).toEqual(run.before)
    }),
  )

  it.effect("no network is offline and keeps local data", () =>
    Effect.gen(function* () {
      const run = yield* scenario(() => Promise.reject(new TypeError("Failed to fetch")))
      expect(Result.isFailure(run.result) && run.result.failure.reason).toBe("offline")
      expect(run.after).toEqual(run.before)
    }),
  )
})

describe("AccountErasure unexpected answers", () => {
  it.effect.each([[{}], [{ deleted: false }]])(
    "a 200 whose body is %j is a server failure: nothing wiped, tokens kept",
    ([body]) =>
      Effect.gen(function* () {
        const run = yield* scenario(() => json(body))
        expect(Result.isFailure(run.result) && run.result.failure.reason).toBe("server")
        expect(run.after).toEqual(run.before)
        expect(run.tokens).toEqual(TOKENS)
      }),
  )

  it.effect("a server delete followed by a failed local wipe is a local failure, tokens kept", () =>
    Effect.gen(function* () {
      const run = yield* scenario(() => json({ deleted: true }), { failWipe: true })
      expect(Result.isFailure(run.result) && run.result.failure.reason).toBe("local")
      expect(run.after).toEqual(run.before)
      expect(run.tokens).toEqual(TOKENS)
    }),
  )
})

describe("wipeStatements", () => {
  it("quotes each table name and doubles embedded quotes", () => {
    expect(wipeStatements(["set", 'we"ird'])).toEqual([
      { sql: `DELETE FROM "set"`, params: [] },
      { sql: `DELETE FROM "we""ird"`, params: [] },
    ])
  })
})
