import { AccountErasure } from "@tanren/db"
import type { UserId } from "@tanren/shared"
import { Effect, HashMap, Layer, Ref } from "effect"
import { type MemoryState, MemoryStore, type StoredRow } from "./MemoryStore"

const others =
  (userId: UserId) =>
  <Row extends { readonly userId: UserId }>(
    table: HashMap.HashMap<string, StoredRow<Row>>,
  ): HashMap.HashMap<string, StoredRow<Row>> =>
    HashMap.filter(table, (stored) => stored.row.userId !== userId)

/** Removes every synced row and the clock of `userId` (the D1 version also erases auth rows). */
const erase =
  (userId: UserId) =>
  (state: MemoryState): MemoryState => {
    const keep = others(userId)
    return {
      tables: {
        profile: keep(state.tables.profile),
        exercise: keep(state.tables.exercise),
        plan: keep(state.tables.plan),
        planWeek: keep(state.tables.planWeek),
        plannedSession: keep(state.tables.plannedSession),
        plannedSet: keep(state.tables.plannedSet),
        session: keep(state.tables.session),
        set: keep(state.tables.set),
        programEnrollment: keep(state.tables.programEnrollment),
        programDayCompletion: keep(state.tables.programDayCompletion),
      },
      clock: HashMap.remove(state.clock, userId),
    }
  }

/**
 * In-memory `AccountErasure` for Node tests, on the shared `MemoryStore`. The integration and token
 * fakes keep their own state and are not erased here (the D1 repo erases those tables).
 */
export const MemoryAccountErasure = {
  layer: Layer.effect(
    AccountErasure,
    Effect.gen(function* () {
      const store = yield* MemoryStore
      return AccountErasure.of({
        deleteUser: (userId) => Ref.update(store.state, erase(userId)),
      })
    }),
  ),
} as const
