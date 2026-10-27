import type { FoodEntryId } from "@tanren/shared"
import { type Effect, Exit } from "effect"
import { useMemo } from "react"
import { type FoodEntryRepoShape, flipAndSync } from "../services/FoodEntryRepo"
import { runtime } from "../services/runtime"
import type { StoreError } from "../services/SqlDriver"
import { SyncEngine } from "../services/SyncEngine"

const requestSync = SyncEngine.use((engine) => engine.requestSync)

/** Runs `flipAndSync` in the app runtime; a defect, interrupt or failed runtime build resolves false. */
const run = (flip: (repo: FoodEntryRepoShape) => Effect.Effect<boolean, StoreError>) =>
  runtime
    .runPromiseExit(flipAndSync(flip, requestSync))
    .then((exit) => Exit.isSuccess(exit) && exit.value)

/**
 * Delete and Undo for the food log (nutrition.md §6): `softDelete` tombstones a live entry,
 * `restore` brings a deleted one back; both write dirty rows and request a sync. `true` when the
 * row changed, `false` when it did not or the store failed. Readers refresh via `StoreEvents`.
 */
export const useFoodEntryActions = (): {
  readonly softDelete: (id: FoodEntryId) => Promise<boolean>
  readonly restore: (id: FoodEntryId) => Promise<boolean>
} =>
  useMemo(
    () => ({
      softDelete: (id: FoodEntryId) => run((repo) => repo.softDelete(id)),
      restore: (id: FoodEntryId) => run((repo) => repo.restore(id)),
    }),
    [],
  )
