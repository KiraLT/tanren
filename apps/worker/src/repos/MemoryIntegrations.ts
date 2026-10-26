import {
  ActivityExportRepo,
  type ActivityExportRepoShape,
  type ExportOutcome,
  type ExportRow,
  IntegrationRepo,
  type IntegrationRepoShape,
  type IntegrationRow,
} from "@tanren/db"
import { Array as Arr, Context, DateTime, Effect, Layer, Match, Option, Order, Ref } from "effect"

// In-memory `IntegrationRepo` + `ActivityExportRepo` for the Node app tests (`memoryPersistence`).
// The D1 implementations (`@tanren/db`) need workerd; their SQL rules are proven there. This fake
// keeps the observable contract (ordering, reset rules, counts) and claims without guards.

interface State {
  readonly integrations: ReadonlyArray<IntegrationRow>
  readonly exports: ReadonlyArray<ExportRow>
}

const newestFirst: Order.Order<ExportRow> = Order.flip(
  Order.combine(
    Order.mapInput(DateTime.Order, (row: ExportRow) => row.createdAt),
    Order.mapInput(Order.String, (row: ExportRow) => row.id),
  ),
)

const settled = (row: ExportRow, outcome: ExportOutcome): ExportRow => {
  const base = { ...row, attempts: row.attempts + 1, updatedAt: outcome.now }
  return Match.value(outcome).pipe(
    Match.tagsExhaustive({
      Sent: (o): ExportRow => ({
        ...base,
        status: "sent",
        externalActivityId: Option.some(o.externalActivityId),
        lastError: Option.none(),
      }),
      Failed: (o): ExportRow => ({ ...base, status: "failed", lastError: Option.some(o.reason) }),
      Dead: (o): ExportRow => ({ ...base, status: "dead", lastError: Option.some(o.reason) }),
      Pending: (o): ExportRow => ({
        ...base,
        status: "pending",
        lastError: Option.some(o.reason),
        nextAttemptAt: o.nextAttemptAt,
      }),
      Blocked: (o): ExportRow => ({
        ...base,
        status: "blocked",
        lastError: Option.some(o.reason),
        nextAttemptAt: o.nextAttemptAt,
      }),
    }),
  )
}

const make = Effect.gen(function* () {
  const state = yield* Ref.make<State>({ integrations: [], exports: [] })
  const update = (f: (s: State) => State) => Ref.update(state, f)
  const read = Ref.get(state)

  const integration: IntegrationRepoShape = {
    get: (userId, provider) =>
      Effect.map(read, (s) =>
        Arr.findFirst(s.integrations, (r) => r.userId === userId && r.provider === provider),
      ),
    upsert: (row) =>
      update((s) => {
        const existing = Arr.findFirst(
          s.integrations,
          (r) => r.userId === row.userId && r.provider === row.provider,
        )
        const next = Option.match(existing, {
          onNone: () => row,
          onSome: (old) => ({ ...row, id: old.id, createdAt: old.createdAt }),
        })
        return {
          ...s,
          integrations: [...Arr.filter(s.integrations, (r) => r.id !== next.id), next],
        }
      }),
    setTokens: (id, tokens) =>
      update((s) => ({
        ...s,
        integrations: Arr.map(s.integrations, (r) =>
          r.id === id
            ? {
                ...r,
                accessToken: tokens.access,
                refreshToken: tokens.refresh,
                expiresAt: tokens.expiresAt,
                updatedAt: tokens.updatedAt,
              }
            : r,
        ),
      })),
    markRevoked: (id, seenUpdatedAt, updatedAt) =>
      update((s) => ({
        ...s,
        integrations: Arr.map(s.integrations, (r) =>
          r.id === id && DateTime.Equivalence(r.updatedAt, seenUpdatedAt)
            ? { ...r, status: "revoked" as const, updatedAt }
            : r,
        ),
      })),
    remove: (userId, provider) =>
      update((s) => ({
        integrations: Arr.filter(
          s.integrations,
          (r) => !(r.userId === userId && r.provider === provider),
        ),
        exports: Arr.filter(s.exports, (r) => !(r.userId === userId && r.provider === provider)),
      })),
  }

  const activityExport: ActivityExportRepoShape = {
    enqueue: (rows) =>
      update((s) => ({
        ...s,
        exports: [
          ...s.exports,
          ...Arr.filter(
            Arr.map(
              rows,
              (r): ExportRow => ({
                ...r,
                status: "pending",
                attempts: 0,
                externalActivityId: Option.none(),
                lastError: Option.none(),
                updatedAt: r.createdAt,
              }),
            ),
            (r) =>
              !s.exports.some(
                (e) =>
                  e.userId === r.userId && e.provider === r.provider && e.sessionId === r.sessionId,
              ),
          ),
        ],
      })),
    claimDue: (now, opts) =>
      Ref.modify(state, (s) => {
        const due = Arr.take(
          Arr.filter(
            s.exports,
            (r) =>
              (r.status === "pending" || r.status === "blocked") &&
              DateTime.isLessThanOrEqualTo(r.nextAttemptAt, now) &&
              Option.match(opts.userId, { onNone: () => true, onSome: (u) => u === r.userId }),
          ),
          opts.max,
        )
        const ids = Arr.map(due, (r) => r.id)
        const claimed = Arr.map(
          due,
          (r): ExportRow => ({ ...r, status: "running", updatedAt: now }),
        )
        return [
          claimed,
          {
            ...s,
            exports: Arr.map(s.exports, (r) =>
              ids.includes(r.id) ? { ...r, status: "running" as const, updatedAt: now } : r,
            ),
          },
        ] as const
      }),
    settle: (id, outcome) =>
      update((s) => ({
        ...s,
        exports: Arr.map(s.exports, (r) => (r.id === id ? settled(r, outcome) : r)),
      })),
    list: (userId, provider, limit) =>
      Effect.map(read, (s) =>
        Arr.take(
          Arr.sort(
            Arr.filter(s.exports, (r) => r.userId === userId && r.provider === provider),
            newestFirst,
          ),
          limit,
        ),
      ),
    resetToPending: (userId, id, now) =>
      Ref.modify(state, (s) => {
        const hit = s.exports.some(
          (r) =>
            r.id === id &&
            r.userId === userId &&
            (r.status === "failed" || r.status === "dead" || r.status === "blocked"),
        )
        return [
          hit,
          hit
            ? {
                ...s,
                exports: Arr.map(s.exports, (r) =>
                  r.id === id
                    ? {
                        ...r,
                        status: "pending" as const,
                        attempts: 0,
                        nextAttemptAt: now,
                        updatedAt: now,
                      }
                    : r,
                ),
              }
            : s,
        ] as const
      }),
    counts: (userId, provider) =>
      Effect.map(read, (s) => {
        const mine = Arr.filter(s.exports, (r) => r.userId === userId && r.provider === provider)
        const count = (pred: (r: ExportRow) => boolean) => Arr.filter(mine, pred).length
        const sent = Arr.filter(mine, (r) => r.status === "sent")
        return {
          pending: count((r) => r.status === "pending" || r.status === "running"),
          failed: count((r) => r.status === "failed" || r.status === "dead"),
          blocked: count((r) => r.status === "blocked"),
          lastSentAt: Option.map(
            Arr.last(
              Arr.sort(
                sent,
                Order.mapInput(DateTime.Order, (r: ExportRow) => r.updatedAt),
              ),
            ),
            (r) => r.updatedAt,
          ),
        }
      }),
  }

  return Context.make(IntegrationRepo, integration).pipe(
    Context.add(ActivityExportRepo, activityExport),
  )
})

/** Both ports on one fresh in-memory state (per layer build). */
export const MemoryIntegrations = { layer: Layer.effectContext(make) } as const
