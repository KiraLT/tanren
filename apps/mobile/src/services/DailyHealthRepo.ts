import { type DailyHealth, DailyHealthRow, type LocalDate } from "@tanren/shared"
import { Array as Arr, Context, Effect, Layer, type Option } from "effect"
import { decodeRecords, LocalStore } from "./LocalStore"
import type { StoreError } from "./SqlDriver"

export interface DailyHealthRepoShape {
  /**
   * The live `daily_health` row for the device's local day (garmin.md §7), newest `updatedAt`
   * first when several providers wrote one. Read-only: the Worker writes these rows.
   */
  readonly today: (localDate: LocalDate) => Effect.Effect<Option.Option<DailyHealth>, StoreError>
}

const TODAY = `SELECT * FROM "daily_health" WHERE "date" = ? AND "deletedAt" IS NULL
  ORDER BY "updatedAt" DESC LIMIT 1`

export class DailyHealthRepo extends Context.Service<DailyHealthRepo, DailyHealthRepoShape>()(
  "@tanren/DailyHealthRepo",
) {
  static readonly layer: Layer.Layer<DailyHealthRepo, never, LocalStore> = Layer.effect(
    this,
    Effect.gen(function* () {
      const store = yield* LocalStore
      const today = (localDate: LocalDate) =>
        store
          .all({ sql: TODAY, params: [localDate] })
          .pipe(Effect.flatMap(decodeRecords(DailyHealthRow)), Effect.map(Arr.head))
      return DailyHealthRepo.of({ today })
    }),
  )
}
