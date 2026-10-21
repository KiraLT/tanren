import { describe, expect, it } from "@effect/vitest"
import { ExerciseRow, ROW_KEYS, UserId } from "@tanren/shared"
import { Effect, Option, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { ExerciseRepo } from "./repositories/Exercise"
import { exercise, TestLayer, userA } from "./testing/fixtures"

const owner = UserId.make(userA)

/** `Exercise.catalogId` must survive every step of the D1 write path (v2-catalog.md §4). */
describe("exercise catalogId persistence", () => {
  it("is one of the columns the repository writes (ROW_KEYS.exercise)", () => {
    expect(ROW_KEYS.exercise).toContain("catalogId")
  })

  it.effect("encodes to a row carrying catalogId and decodes back", () =>
    Effect.gen(function* () {
      const linked = exercise({
        id: "20000000-0000-4000-8000-000000000001",
        catalogId: "barbell-back-squat",
      })
      const record = yield* Schema.encodeEffect(ExerciseRow)(linked)
      expect(record.catalogId).toBe("barbell-back-squat")
      const decoded = yield* Schema.decodeUnknownEffect(ExerciseRow)(record)
      expect(decoded.catalogId).toEqual(Option.some("barbell-back-squat"))
    }),
  )

  it.effect("is stored in the catalog_id column and read back through the repository", () =>
    Effect.gen(function* () {
      const repo = yield* ExerciseRepo
      const sql = yield* SqlClient.SqlClient
      const linked = exercise({
        id: "20000000-0000-4000-8000-000000000002",
        name: "Back Squat",
        aliases: [],
        catalogId: "barbell-back-squat",
      })
      const unlinked = exercise({
        id: "20000000-0000-4000-8000-000000000003",
        name: "Farmer Carry",
        aliases: [],
      })
      yield* repo.put(owner, [linked, unlinked])
      // D1Layer maps result names snake_case -> camelCase, so the `catalog_id` column reads `catalogId`.
      const columns = yield* sql<{ readonly id: string; readonly catalogId: string | null }>`
        SELECT id, catalog_id FROM exercise WHERE id IN (${linked.id}, ${unlinked.id}) ORDER BY id`
      expect(columns.map((c) => c.catalogId)).toEqual(["barbell-back-squat", null])
      expect((yield* repo.get(owner, linked.id)).pipe(Option.map((e) => e.catalogId))).toEqual(
        Option.some(Option.some("barbell-back-squat")),
      )
      expect((yield* repo.get(owner, unlinked.id)).pipe(Option.map((e) => e.catalogId))).toEqual(
        Option.some(Option.none()),
      )
    }).pipe(Effect.provide(TestLayer)),
  )
})
