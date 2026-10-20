import {
  type AcceptedChange,
  PullRequest,
  PullResponse,
  PushRequest,
  PushResponse,
  type RejectedChange,
  SYNC_TABLE_ORDER,
  type SyncChange,
  SyncCursor,
  type UserId,
} from "@tanren/shared"
import { Array as Arr, Context, DateTime, Effect, Layer, Option, Order, Ref, Schema } from "effect"
import { SyncTransport, TransportError } from "./SyncTransport"

/**
 * In-memory stand-in for the worker's sync endpoints (data model §10.2), for tests and offline
 * dev: rejects foreign `userId` (`forbidden`), accepts strictly newer rows, returns the server
 * row as a conflict on older-or-equal, and pages pulls by a monotonic sequence cursor. Not
 * modelled: missing-parent / immutable-field checks, the 5-minute clock clamp.
 */
interface StoredRow {
  readonly change: SyncChange
  readonly seq: number
}

interface ServerState {
  readonly rows: ReadonlyArray<StoredRow>
  readonly seq: number
  readonly reachable: boolean
}

interface PushOutcome {
  readonly state: ServerState
  readonly accepted: ReadonlyArray<AcceptedChange>
  readonly conflicts: ReadonlyArray<SyncChange>
  readonly rejected: ReadonlyArray<RejectedChange>
}

const sameRow = (a: SyncChange, b: SyncChange): boolean =>
  a.table === b.table && a.row.id === b.row.id

const pushOrder: Order.Order<SyncChange> = Order.combine(
  Order.mapInput(Order.Number, (change: SyncChange) => SYNC_TABLE_ORDER.indexOf(change.table)),
  Order.mapInput(DateTime.Order, (change: SyncChange) => change.row.updatedAt),
)

const applyChange =
  (userId: UserId) =>
  (outcome: PushOutcome, change: SyncChange): PushOutcome => {
    const { state } = outcome
    if (change.row.userId !== userId) {
      const rejected: RejectedChange = {
        table: change.table,
        id: change.row.id,
        reason: "forbidden",
        message: "row belongs to another user",
      }
      return { ...outcome, rejected: [...outcome.rejected, rejected] }
    }
    const existing = Arr.findFirst(state.rows, (stored) => sameRow(stored.change, change))
    if (
      Option.isSome(existing) &&
      !DateTime.isGreaterThan(change.row.updatedAt, existing.value.change.row.updatedAt)
    ) {
      return { ...outcome, conflicts: [...outcome.conflicts, existing.value.change] }
    }
    const seq = state.seq + 1
    const accepted: AcceptedChange = {
      table: change.table,
      id: change.row.id,
      updatedAt: change.row.updatedAt,
    }
    return {
      ...outcome,
      state: {
        ...state,
        seq,
        rows: [...state.rows.filter((stored) => !sameRow(stored.change, change)), { change, seq }],
      },
      accepted: [...outcome.accepted, accepted],
    }
  }

const cursorOf = (seq: number): SyncCursor => SyncCursor.make(String(seq))

/** Sends a value through its wire encoding and back, as the HTTP transport would. */
const viaWire =
  <S extends Schema.Codec<unknown, unknown>>(schema: S) =>
  (value: S["Type"]): Effect.Effect<S["Type"], TransportError> =>
    Schema.encodeEffect(schema)(value).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(schema)),
      Effect.mapError((cause) => new TransportError({ reason: "decode", cause })),
    )

export interface MockSyncServerShape {
  readonly sendChanges: (userId: UserId, request: PushRequest) => Effect.Effect<PushResponse>
  readonly fetchChanges: (userId: UserId, request: PullRequest) => Effect.Effect<PullResponse>
  /** Every stored row, in sync order. */
  readonly rows: Effect.Effect<ReadonlyArray<SyncChange>>
  /** `false` makes every transport call fail as `unreachable`. */
  readonly setReachable: (reachable: boolean) => Effect.Effect<void>
  readonly reachable: Effect.Effect<boolean>
}

export class MockSyncServer extends Context.Service<MockSyncServer, MockSyncServerShape>()(
  "@tanren/MockSyncServer",
) {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const state = yield* Ref.make<ServerState>({ rows: [], seq: 0, reachable: true })
      return MockSyncServer.of({
        sendChanges: (userId, request) =>
          Effect.gen(function* () {
            const serverTime = yield* DateTime.now
            const outcome = yield* Ref.modify(
              state,
              (current): readonly [PushOutcome, ServerState] => {
                const result = Arr.sort(request.changes, pushOrder).reduce(applyChange(userId), {
                  state: current,
                  accepted: [],
                  conflicts: [],
                  rejected: [],
                })
                return [result, result.state]
              },
            )
            return {
              accepted: outcome.accepted,
              conflicts: outcome.conflicts,
              rejected: outcome.rejected,
              serverTime,
            }
          }),
        fetchChanges: (userId, request) =>
          Effect.gen(function* () {
            const serverTime = yield* DateTime.now
            const current = yield* Ref.get(state)
            const since = Option.match(request.since, { onNone: () => 0, onSome: Number })
            const pending = current.rows.filter(
              (stored) => stored.seq > since && stored.change.row.userId === userId,
            )
            const page = Arr.take(pending, request.limit)
            const last = Option.match(Arr.last(page), {
              onNone: () => since,
              onSome: (stored) => stored.seq,
            })
            return {
              changes: page.map((stored) => stored.change),
              cursor: cursorOf(last),
              serverTime,
              hasMore: pending.length > page.length,
            }
          }),
        rows: Ref.get(state).pipe(
          Effect.map((current) => current.rows.map((stored) => stored.change)),
        ),
        setReachable: (reachable) => Ref.update(state, (current) => ({ ...current, reachable })),
        reachable: Ref.get(state).pipe(Effect.map((current) => current.reachable)),
      })
    }),
  )

  /** A device signed in as `userId`, talking to the mock through the wire schemas. */
  static readonly transport = (userId: UserId) =>
    Layer.effect(
      SyncTransport,
      Effect.gen(function* () {
        const server = yield* MockSyncServer
        const guard = server.reachable.pipe(
          Effect.flatMap((reachable) =>
            reachable
              ? Effect.void
              : Effect.fail(
                  new TransportError({ reason: "unreachable", cause: "mock server down" }),
                ),
          ),
        )
        return SyncTransport.of({
          sendChanges: (request) =>
            guard.pipe(
              Effect.andThen(viaWire(PushRequest)(request)),
              Effect.flatMap((decoded) => server.sendChanges(userId, decoded)),
              Effect.flatMap(viaWire(PushResponse)),
            ),
          fetchChanges: (request) =>
            guard.pipe(
              Effect.andThen(viaWire(PullRequest)(request)),
              Effect.flatMap((decoded) => server.fetchChanges(userId, decoded)),
              Effect.flatMap(viaWire(PullResponse)),
            ),
        })
      }),
    )
}
