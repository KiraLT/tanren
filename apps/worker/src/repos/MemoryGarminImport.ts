import {
  GarminImportRepo,
  IntegrationRepo,
  type IntegrationRepoShape,
  PersistenceError,
} from "@tanren/db"
import {
  DailyHealth,
  DailyHealthId,
  type DailyHealthInsert,
  IdGenerator,
  ImportedActivity,
  ImportedActivityId,
  type ImportedActivityInsert,
  type Provider,
  type UserId,
} from "@tanren/shared"
import { Array as Arr, DateTime, Effect, Layer, Option } from "effect"
import { MemoryStore } from "./MemoryStore"

const isLive = (row: { readonly deletedAt: Option.Option<DateTime.Utc> }) =>
  Option.isNone(row.deletedAt)

/** The last row per key, in first-seen order (like the D1 repo). */
const lastByKey = <A>(rows: ReadonlyArray<A>, key: (a: A) => string): ReadonlyArray<A> =>
  Arr.filter(rows, (row, i) => !rows.slice(i + 1).some((later) => key(later) === key(row)))

/**
 * Like the D1 repo, an upsert writes nothing for a provider without an active connection (a pull in
 * flight never undoes a disconnect). `integrations` is the same `IntegrationRepo` the app uses
 * (`memoryPersistence` builds this layer on `MemoryIntegrations`).
 */
const connectedOnly = <R extends { readonly provider: Provider }>(
  integrations: IntegrationRepoShape,
  userId: UserId,
  rows: ReadonlyArray<R>,
) =>
  Effect.gen(function* () {
    const providers = yield* Effect.forEach(Arr.dedupe(Arr.map(rows, (r) => r.provider)), (p) =>
      Effect.map(integrations.get(userId, p), (row) =>
        Option.exists(row, (r) => r.status === "active") ? Option.some(p) : Option.none(),
      ),
    )
    const active = Arr.getSomes(providers)
    return Arr.filter(rows, (r) => active.includes(r.provider))
  })

/**
 * In-memory `GarminImportRepo` for Node tests, on the shared `MemoryStore` (so `/sync/pull` sees the
 * rows). Same natural-key reuse as the D1 repo: an existing `(provider, externalId)` /
 * `(provider, date)` row keeps its id and `createdAt`. No LWW clamp: the store has none.
 */
export const MemoryGarminImport = {
  layer: Layer.effect(
    GarminImportRepo,
    Effect.gen(function* () {
      const store = yield* MemoryStore
      const ids = yield* IdGenerator
      const integrations = yield* IntegrationRepo
      const failed = (operation: string) => (cause: unknown) =>
        new PersistenceError({ operation, cause })

      const upsertActivities = (userId: UserId, rows: ReadonlyArray<ImportedActivityInsert>) =>
        Effect.gen(function* () {
          const unique = lastByKey(
            yield* connectedOnly(integrations, userId, rows),
            (r) => `${r.provider}|${r.externalId}`,
          )
          const stored = Arr.map(yield* store.rows("importedActivity", userId), (s) => s.row)
          const now = yield* DateTime.now
          const next = yield* Effect.forEach(unique, (insert) =>
            Effect.gen(function* () {
              const prior = Arr.findFirst(
                stored,
                (r) => r.provider === insert.provider && r.externalId === insert.externalId,
              )
              return yield* ImportedActivity.makeEffect({
                ...insert,
                id: Option.isSome(prior)
                  ? prior.value.id
                  : ImportedActivityId.make(yield* ids.next),
                userId,
                createdAt: Option.match(prior, { onNone: () => now, onSome: (p) => p.createdAt }),
                updatedAt: now,
                deletedAt: Option.none(),
              })
            }),
          )
          if (next.length > 0) {
            yield* store.put("importedActivity", userId, next)
          }
          return next.length
        }).pipe(Effect.mapError(failed("garminImport.upsertActivities")))

      const upsertDays = (userId: UserId, rows: ReadonlyArray<DailyHealthInsert>) =>
        Effect.gen(function* () {
          const unique = lastByKey(
            yield* connectedOnly(integrations, userId, rows),
            (r) => `${r.provider}|${r.date}`,
          )
          const stored = Arr.map(yield* store.rows("dailyHealth", userId), (s) => s.row)
          const now = yield* DateTime.now
          const next = yield* Effect.forEach(unique, (insert) =>
            Effect.gen(function* () {
              const prior = Arr.findFirst(
                stored,
                (r) => r.provider === insert.provider && r.date === insert.date,
              )
              return yield* DailyHealth.makeEffect({
                ...insert,
                id: Option.isSome(prior) ? prior.value.id : DailyHealthId.make(yield* ids.next),
                userId,
                createdAt: Option.match(prior, { onNone: () => now, onSome: (p) => p.createdAt }),
                updatedAt: now,
                deletedAt: Option.none(),
              })
            }),
          )
          if (next.length > 0) {
            yield* store.put("dailyHealth", userId, next)
          }
          return next.length
        }).pipe(Effect.mapError(failed("garminImport.upsertDays")))

      const softDeleteAll = (userId: UserId, provider: Provider) =>
        Effect.gen(function* () {
          const now = yield* DateTime.now
          const activities = yield* Effect.forEach(
            Arr.filter(
              Arr.map(yield* store.rows("importedActivity", userId), (s) => s.row),
              (r) => r.provider === provider && isLive(r),
            ),
            (r) =>
              ImportedActivity.makeEffect({ ...r, updatedAt: now, deletedAt: Option.some(now) }),
          )
          const days = yield* Effect.forEach(
            Arr.filter(
              Arr.map(yield* store.rows("dailyHealth", userId), (s) => s.row),
              (r) => r.provider === provider && isLive(r),
            ),
            (r) => DailyHealth.makeEffect({ ...r, updatedAt: now, deletedAt: Option.some(now) }),
          )
          if (activities.length > 0) {
            yield* store.put("importedActivity", userId, activities)
          }
          if (days.length > 0) {
            yield* store.put("dailyHealth", userId, days)
          }
          return activities.length + days.length
        }).pipe(Effect.mapError(failed("garminImport.softDeleteAll")))

      const counts = (userId: UserId, provider: Provider) =>
        Effect.gen(function* () {
          const activities = yield* store.rows("importedActivity", userId)
          const days = yield* store.rows("dailyHealth", userId)
          return {
            activities: Arr.filter(activities, (s) => s.row.provider === provider && isLive(s.row))
              .length,
            days: Arr.filter(days, (s) => s.row.provider === provider && isLive(s.row)).length,
          }
        })

      return GarminImportRepo.of({ upsertActivities, upsertDays, softDeleteAll, counts })
    }),
  ),
} as const
