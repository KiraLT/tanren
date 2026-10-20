import { D1Client } from "@effect/sql-d1"
import { String as Str } from "effect"

/** The Workers `D1Database` binding type, as `@effect/sql-d1` declares it. */
export type D1Database = D1Client.D1ClientConfig["db"]

/** SQL client over a D1 binding: camelCase in TS, snake_case in SQL (db.md §6). Built per request. */
export const D1Layer = (db: D1Database) =>
  D1Client.layer({
    db,
    transformResultNames: Str.snakeToCamel,
    transformQueryNames: Str.camelToSnake,
  })
