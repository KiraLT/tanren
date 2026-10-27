import { describe, expect, it } from "@effect/vitest"
import { ROW_KEYS, ROW_TABLE, SyncTable } from "@tanren/shared"
import { getTableConfig, type SQLiteTable } from "drizzle-orm/sqlite-core"
import { Array as Arr, String as Str } from "effect"
import { exercise } from "./exercise"
import { dailyHealth, importedActivity } from "./garmin"
import { plan, plannedSession, plannedSet, planWeek } from "./plan"
import { programDayCompletion, programEnrollment } from "./program"
import { workoutSession, workoutSet } from "./session"
import { profile } from "./user"

/** Drizzle tables and the shared row codecs describe one row twice (ADR-0006): drift fails here. */
const TABLES: { readonly [T in SyncTable]: SQLiteTable } = {
  profile,
  exercise,
  plan,
  planWeek,
  plannedSession,
  plannedSet,
  session: workoutSession,
  set: workoutSet,
  programEnrollment,
  programDayCompletion,
  importedActivity,
  dailyHealth,
}

/** Server-only: never on a synced row. */
const SERVER_COLUMNS = ["server_seq"]

describe("table/codec parity", () => {
  it.each(SyncTable.literals)("%s table columns match its row codec keys", (table) => {
    const config = getTableConfig(TABLES[table])
    const columns = config.columns.map((c) => c.name).filter((c) => !SERVER_COLUMNS.includes(c))
    expect(config.name).toBe(ROW_TABLE[table])
    expect(Arr.sort(columns, Str.Order)).toEqual(
      Arr.sort(ROW_KEYS[table].map(Str.camelToSnake), Str.Order),
    )
  })
})
