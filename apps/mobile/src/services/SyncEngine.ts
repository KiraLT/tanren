import {
  MAX_PUSH_CHANGES,
  type PushResponse,
  SYNC_TABLE_ORDER,
  type SyncChange,
  SyncCursor,
  type SyncTable,
  type UserId,
} from "@tanren/shared"
import {
  Array as Arr,
  Context,
  DateTime,
  type Duration,
  Effect,
  type Exit,
  Layer,
  Option,
  Queue,
  Schema,
  Semaphore,
} from "effect"
import { LOCAL_USER_ID } from "../store/localUser"
import {
  countPushable,
  lwwUpsert,
  markAccepted,
  markRejected,
  pushableRows,
  readCursor,
  readOwner,
  rekeyStatements,
  writeCursor,
} from "../store/syncQueries"
import { type CurrentUser, whenSignedIn } from "./CurrentUser"
import { encodeChange, LocalChange, LocalStore } from "./LocalStore"
import { SqlDriver, type SqlRecord, type SqlStatement, StoreError } from "./SqlDriver"
import { StoreEvents } from "./StoreEvents"
import { SyncTransport, type TransportError } from "./SyncTransport"
import { TodayRepo } from "./TodayRepo"

/**
 * AUTO-FIN (ADR-0018, REV-AF): closes stale open sessions, only right after `pullLoop` has landed
 * every page in `syncOnce` (never at startup: before its first pull a device may hold a session
 * another device already finished, and would give it an earlier `finishedAt`; offline nothing
 * closes until a pull succeeds). `TodayRepo` is read from the caller's context
 * (`serviceOption`): the app runtime has it; engine-only tests do not, and then this is a no-op.
 * A failure is logged and never fails the sync.
 */
const closeStaleSessions: Effect.Effect<void> = Effect.serviceOption(TodayRepo).pipe(
  Effect.flatMap(
    Option.match({
      onNone: () => Effect.void,
      onSome: (repo) => DateTime.now.pipe(Effect.flatMap(repo.finishStaleSessions)),
    }),
  ),
  Effect.catch((error) => Effect.logWarning("SyncEngine: closing stale sessions failed", error)),
  Effect.asVoid,
)

export const PULL_PAGE_LIMIT = 200
/** Fallback period of the background loop. */
export const SYNC_INTERVAL: Duration.Input = "60 seconds"
/** Wait after a `requestSync` so rapid taps coalesce into one push. */
export const PUSH_DEBOUNCE: Duration.Input = "500 millis"

/** How the background loop tells its caller (the `useSync` hook) about each round. */
export interface SyncReport {
  readonly started: Effect.Effect<void>
  readonly finished: (
    exit: Exit.Exit<Option.Option<SyncSummary>, TransportError | StoreError>,
  ) => Effect.Effect<void>
}

export interface SyncSummary {
  readonly pushed: number
  readonly rejected: number
  readonly pulled: number
  /** ISO `serverTime` of the last pull page. */
  readonly serverTime: string
}

export interface SyncEngineShape {
  /** Push every dirty row, then pull until caught up (data model §10.3). */
  readonly syncOnce: Effect.Effect<SyncSummary, TransportError | StoreError>
  /** `syncOnce`, or `None` without waiting when another sync on this engine is running. */
  readonly syncOnceExclusive: Effect.Effect<Option.Option<SyncSummary>, TransportError | StoreError>
  /**
   * After sign-in, before any push or pull: moves `LOCAL_USER_ID` rows to `userId` in one batch
   * (`rekeyStatements`), then bumps `StoreEvents`. Holds the sync lock, so no sync interleaves.
   * Skipped (`false`) when the store already belongs to `userId`.
   */
  readonly rekeyLocalUser: (userId: UserId) => Effect.Effect<boolean, StoreError>
  /**
   * Asks `background` for a sync `PUSH_DEBOUNCE` from now (after a local write). Requests made
   * during that wait, or while a sync runs, collapse into one more round; never lost, never queued.
   */
  readonly requestSync: Effect.Effect<void>
  /**
   * Syncs at once, then forever: waits `SYNC_INTERVAL` or a `requestSync` + `PUSH_DEBOUNCE`, and
   * syncs again (`syncOnceExclusive`). A failed round (offline) is reported, not retried early.
   * While `CurrentUser.signedIn` is `None` every round is skipped: no request, no report.
   */
  readonly background: (report: SyncReport) => Effect.Effect<never, never, CurrentUser>
}

interface Pushed {
  readonly table: SyncTable
  readonly id: string
  readonly updatedAt: string
}

interface DirtyRow {
  readonly change: SyncChange
  readonly pushed: Pushed
}

interface Collected {
  readonly rows: ReadonlyArray<DirtyRow>
  /** Undecodable rows flagged `invalid` during this collection. */
  readonly invalid: number
}

const toStoreError = (cause: unknown): StoreError => new StoreError({ cause })

const decodeChange = (table: SyncTable, record: SqlRecord): Effect.Effect<SyncChange, StoreError> =>
  Schema.decodeUnknownEffect(LocalChange)({ table, row: record }).pipe(
    Effect.mapError(toStoreError),
  )

export class SyncEngine extends Context.Service<SyncEngine, SyncEngineShape>()(
  "@tanren/SyncEngine",
) {
  static readonly layerNoDeps = Layer.effect(
    this,
    Effect.gen(function* () {
      const store = yield* LocalStore
      const driver = yield* SqlDriver
      const transport = yield* SyncTransport
      const events = yield* StoreEvents
      /** Sync writes bypass `LocalStore.write`, so they notify readers themselves. */
      const commit = (statements: ReadonlyArray<SqlStatement>) =>
        driver.batch(statements).pipe(Effect.andThen(events.bump))

      /**
       * A dirty row that does not decode can never be pushed: flag it `_rejected = "invalid"`
       * (not retried until a local edit clears the flag) so it stops blocking healthy rows.
       */
      const flagInvalid = (invalid: ReadonlyArray<Pushed>) =>
        invalid.length === 0
          ? Effect.void
          : Effect.forEach(
              invalid,
              ({ table, id }) =>
                Effect.logWarning("SyncEngine: undecodable dirty row flagged invalid", {
                  table,
                  id,
                }),
              { discard: true },
            ).pipe(
              Effect.andThen(
                commit(
                  invalid.map((row) => markRejected(row.table, row.id, row.updatedAt, "invalid")),
                ),
              ),
            )

      /** Pushable rows, parents first, at most `MAX_PUSH_CHANGES`; undecodable ones are flagged. */
      const collectDirty = Effect.reduce(
        SYNC_TABLE_ORDER,
        (): Collected => ({ rows: [], invalid: 0 }),
        (collected, table) =>
          collected.rows.length >= MAX_PUSH_CHANGES
            ? Effect.succeed(collected)
            : store.all(pushableRows(table, MAX_PUSH_CHANGES - collected.rows.length)).pipe(
                Effect.flatMap((records) =>
                  Effect.partition(records, (record) => {
                    const pushed: Pushed = {
                      table,
                      id: String(record.id),
                      updatedAt: String(record.updatedAt),
                    }
                    return decodeChange(table, record).pipe(
                      Effect.map((change): DirtyRow => ({ change, pushed })),
                      Effect.mapError(() => pushed),
                    )
                  }),
                ),
                Effect.flatMap(([rows, invalid]) =>
                  flagInvalid(invalid).pipe(
                    Effect.as({
                      rows: [...collected.rows, ...rows],
                      invalid: collected.invalid + invalid.length,
                    }),
                  ),
                ),
              ),
      )

      const pushableCount = Effect.forEach(SYNC_TABLE_ORDER, (table) =>
        store.all(countPushable(table)).pipe(Effect.map((rows) => Number(rows[0]?.n ?? 0))),
      ).pipe(Effect.map((counts) => counts.reduce((total, n) => total + n, 0)))

      const applyPushResponse = (pushed: ReadonlyArray<Pushed>, response: PushResponse) =>
        Effect.gen(function* () {
          const pushedAt = (table: SyncTable, id: string) =>
            Arr.findFirst(pushed, (row) => row.table === table && row.id === id)
          const accepted = response.accepted.flatMap((change) =>
            Option.match(pushedAt(change.table, change.id), {
              onNone: (): ReadonlyArray<SqlStatement> => [],
              onSome: (row) => [
                markAccepted(
                  change.table,
                  change.id,
                  row.updatedAt,
                  DateTime.formatIso(change.updatedAt),
                ),
              ],
            }),
          )
          const rejected = response.rejected.flatMap((change) =>
            Option.match(pushedAt(change.table, change.id), {
              onNone: (): ReadonlyArray<SqlStatement> => [],
              onSome: (row) => [
                markRejected(change.table, change.id, row.updatedAt, change.reason),
              ],
            }),
          )
          const conflicts = yield* Effect.forEach(response.conflicts, (change) =>
            encodeChange(change).pipe(
              Effect.map(({ table, record }) => lwwUpsert(table, record, { strict: false })),
            ),
          )
          yield* commit([...accepted, ...conflicts, ...rejected])
        })

      /** One request per pass; stops when nothing is pushable or a pass made no progress. */
      const pushLoop = (
        pushedSoFar: number,
        rejectedSoFar: number,
      ): Effect.Effect<
        { readonly pushed: number; readonly rejected: number },
        TransportError | StoreError
      > =>
        Effect.gen(function* () {
          const queued = yield* pushableCount
          if (queued === 0) {
            return { pushed: pushedSoFar, rejected: rejectedSoFar }
          }
          const { rows: dirty, invalid } = yield* collectDirty
          if (dirty.length === 0) {
            // Every collected row was undecodable and is now flagged; go on only if the queue shrank.
            const flagged = rejectedSoFar + invalid
            return (yield* pushableCount) < queued
              ? yield* pushLoop(pushedSoFar, flagged)
              : { pushed: pushedSoFar, rejected: flagged }
          }
          const response = yield* transport.sendChanges({
            changes: dirty.map((entry) => entry.change),
          })
          yield* applyPushResponse(
            dirty.map((entry) => entry.pushed),
            response,
          )
          const pushed = pushedSoFar + dirty.length
          const rejected = rejectedSoFar + invalid + response.rejected.length
          // No accepted or rejected row: only conflicts (or nothing) came back, so stop here.
          const progressed = response.accepted.length + response.rejected.length > 0
          return progressed ? yield* pushLoop(pushed, rejected) : { pushed, rejected }
        })

      const storedCursor = store.all(readCursor).pipe(
        Effect.map((rows) => Option.fromNullishOr(rows[0]?.value)),
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.succeed(Option.none<SyncCursor>()),
            onSome: (value) =>
              Schema.decodeUnknownEffect(SyncCursor)(value).pipe(
                Effect.map(Option.some),
                Effect.mapError(toStoreError),
              ),
          }),
        ),
      )

      /** Pages until `hasMore` is false; each page and its cursor land in one transaction. */
      const pullLoop = (
        pulledSoFar: number,
      ): Effect.Effect<
        { readonly pulled: number; readonly serverTime: string },
        TransportError | StoreError
      > =>
        Effect.gen(function* () {
          const since = yield* storedCursor
          const page = yield* transport.fetchChanges({ since, limit: PULL_PAGE_LIMIT })
          const upserts = yield* Effect.forEach(page.changes, (change) =>
            encodeChange(change).pipe(
              Effect.map(({ table, record }) => lwwUpsert(table, record, { strict: true })),
            ),
          )
          yield* commit([...upserts, writeCursor(page.cursor)])
          const pulled = pulledSoFar + page.changes.length
          return page.hasMore
            ? yield* pullLoop(pulled)
            : { pulled, serverTime: DateTime.formatIso(page.serverTime) }
        })

      const syncOnce = Effect.gen(function* () {
        const { pushed, rejected } = yield* pushLoop(0, 0)
        const { pulled, serverTime } = yield* pullLoop(0)
        // Every page has landed: a pulled session now has all its sets (REV-AF).
        yield* closeStaleSessions
        return { pushed, rejected, pulled, serverTime }
      }).pipe(Effect.withSpan("SyncEngine.syncOnce"))

      /** One sync at a time: overlapping triggers are skipped, not queued. */
      const lock = yield* Semaphore.make(1)

      const rekeyLocalUser = (userId: UserId) =>
        lock.withPermits(1)(
          Effect.gen(function* () {
            const owner = yield* store.all(readOwner)
            if (owner[0]?.value === userId) {
              return false
            }
            yield* commit(rekeyStatements(LOCAL_USER_ID, userId))
            return true
          }),
        )

      const syncOnceExclusive = lock.withPermitsIfAvailable(1)(syncOnce)

      /** Sliding queue of one: any number of requests before the next take leave one wake-up. */
      const wake = yield* Queue.sliding<void>(1)
      /** The debounced request clears requests made during the wait, so they share its round. */
      const requested = Queue.take(wake).pipe(
        Effect.andThen(Effect.sleep(PUSH_DEBOUNCE)),
        Effect.andThen(Queue.clear(wake)),
      )
      /** Signed out, a round is skipped unreported: no account, no session, nothing to sync. */
      const round = (report: SyncReport) =>
        whenSignedIn(
          report.started.pipe(
            Effect.andThen(Effect.exit(syncOnceExclusive)),
            Effect.flatMap(report.finished),
          ),
          undefined,
        ).pipe(Effect.andThen(Effect.race(requested, Effect.sleep(SYNC_INTERVAL))))

      return SyncEngine.of({
        syncOnce,
        syncOnceExclusive,
        rekeyLocalUser,
        requestSync: Queue.offer(wake, undefined).pipe(Effect.asVoid),
        background: (report) => Effect.forever(round(report)),
      })
    }),
  )
}
