import { type ImportedActivity, type ImportedActivityId, ImportedActivityRow } from "@tanren/shared"
import { Array as Arr, Context, Effect, Layer, type Option } from "effect"
import { decodeRecords, LocalStore } from "./LocalStore"
import type { StoreError } from "./SqlDriver"

export interface ImportedActivityRepoShape {
  /**
   * One live imported activity for its detail page (garmin.md §6); None when it is missing or
   * soft-deleted. Read-only: the Worker writes these rows.
   */
  readonly byId: (
    id: ImportedActivityId,
  ) => Effect.Effect<Option.Option<ImportedActivity>, StoreError>
}

const BY_ID = `SELECT * FROM "imported_activity" WHERE "id" = ? AND "deletedAt" IS NULL LIMIT 1`

export class ImportedActivityRepo extends Context.Service<
  ImportedActivityRepo,
  ImportedActivityRepoShape
>()("@tanren/ImportedActivityRepo") {
  static readonly layer: Layer.Layer<ImportedActivityRepo, never, LocalStore> = Layer.effect(
    this,
    Effect.gen(function* () {
      const store = yield* LocalStore
      const byId = (id: ImportedActivityId) =>
        store
          .all({ sql: BY_ID, params: [id] })
          .pipe(Effect.flatMap(decodeRecords(ImportedActivityRow)), Effect.map(Arr.head))
      return ImportedActivityRepo.of({ byId })
    }),
  )
}
