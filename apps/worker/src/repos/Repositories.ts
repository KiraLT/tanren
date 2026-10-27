import {
  Repositories as DbRepositories,
  ExerciseRepo,
  PlanRepo,
  ProfileRepo,
  SessionRepo,
} from "@tanren/db"
import type {
  CurrentPlan,
  PlanId,
  PlannedSession,
  PlannedSet,
  PlanWeek,
  Session,
  SyncTable,
  Timestamp,
  UserId,
} from "@tanren/shared"
import { Array as Arr, Context, DateTime, Effect, Layer, Option, Order, pipe } from "effect"
import { MemoryStore, type RowByTable } from "./MemoryStore"

// In-memory implementations of the `@tanren/db` repository ports, for Node tests (the D1
// implementations need workerd). Ordering copies db.md §6 / DM §11.2.

interface ListOptions {
  readonly includeDeleted: boolean
}

interface Row {
  readonly id: string
  readonly createdAt: DateTime.Utc
  readonly deletedAt: Option.Option<DateTime.Utc>
}
const byCreated: Order.Order<Row> = Order.combine(
  Order.mapInput(DateTime.Order, (row: Row) => row.createdAt),
  Order.mapInput(Order.String, (row: Row) => row.id),
)
type OrderedRow = Row & { readonly order: number }
const byOrder: Order.Order<OrderedRow> = Order.combine(
  Order.mapInput(Order.Number, (row: OrderedRow) => row.order),
  byCreated,
)
const isLive = (row: Row): boolean => Option.isNone(row.deletedAt)

const byWeekStart: Order.Order<PlanWeek> = Order.combine(
  Order.mapInput(Order.String, (week: PlanWeek) => week.weekStart),
  byCreated,
)
const liveOnly: ListOptions = { includeDeleted: false }

const live = <A extends Row>(rows: ReadonlyArray<A>, opts: ListOptions): ReadonlyArray<A> =>
  opts.includeDeleted ? rows : Arr.filter(rows, isLive)

const makeMemory = Effect.gen(function* () {
  const store = yield* MemoryStore
  const all = <T extends SyncTable>(table: T, userId: UserId) =>
    store.rows(table, userId).pipe(Effect.map(Arr.map((stored) => stored.row)))
  const find = <T extends SyncTable>(table: T, userId: UserId, id: string) =>
    all(table, userId).pipe(
      Effect.map(
        (rows): Option.Option<RowByTable[T]> => Arr.findFirst(rows, (row) => row.id === id),
      ),
    )
  const put =
    <T extends SyncTable>(table: T) =>
    (userId: UserId, rows: ReadonlyArray<RowByTable[T]>) =>
      store.put(table, userId, rows)

  const listPlans = (userId: UserId, opts: ListOptions) =>
    all("plan", userId).pipe(Effect.map((rows) => Arr.sort(live(rows, opts), byCreated)))

  const listWeeks = (userId: UserId, planId: PlanId) =>
    all("planWeek", userId).pipe(
      Effect.map((rows) =>
        pipe(
          live(rows, liveOnly),
          Arr.filter((week) => week.planId === planId),
          Arr.sort(byWeekStart),
        ),
      ),
    )

  const currentPlan = Effect.fn("PlanRepo.currentPlan")(function* (userId: UserId) {
    const plans = yield* listPlans(userId, liveOnly)
    const active = Arr.findFirst(plans, (plan) => plan.status === "active")
    if (Option.isNone(active)) {
      return Option.none<CurrentPlan>()
    }
    const plan = active.value
    const weeks = yield* listWeeks(userId, plan.id)
    const weekIds: ReadonlyArray<string> = Arr.map(weeks, (week) => week.id)
    const sessions = pipe(
      live(yield* all("plannedSession", userId), liveOnly),
      Arr.filter((session) => weekIds.includes(session.planWeekId)),
      Arr.sort(
        Order.combine(
          Order.mapInput(Order.Number, (session: PlannedSession) =>
            weekIds.indexOf(session.planWeekId),
          ),
          byOrder,
        ),
      ),
    )
    const sessionIds: ReadonlyArray<string> = Arr.map(sessions, (session) => session.id)
    const sets = pipe(
      live(yield* all("plannedSet", userId), liveOnly),
      Arr.filter((set) => sessionIds.includes(set.plannedSessionId)),
      Arr.sort(
        Order.combine(
          Order.mapInput(Order.Number, (set: PlannedSet) =>
            sessionIds.indexOf(set.plannedSessionId),
          ),
          byOrder,
        ),
      ),
    )
    return Option.some<CurrentPlan>({ plan, weeks, sessions, sets })
  })

  const inRange =
    (range: { readonly from: Timestamp; readonly to: Timestamp }) => (session: Session) =>
      DateTime.Order(session.startedAt, range.from) >= 0 &&
      DateTime.Order(session.startedAt, range.to) < 0
  const byStarted: Order.Order<Session> = Order.combine(
    Order.mapInput(DateTime.Order, (session: Session) => session.startedAt),
    Order.mapInput(Order.String, (session: Session) => session.id),
  )

  const profile = ProfileRepo.of({
    get: (userId) => find("profile", userId, userId),
    put: put("profile"),
  })
  const exercise = ExerciseRepo.of({
    get: (userId, id) => find("exercise", userId, id),
    list: (userId, opts) =>
      all("exercise", userId).pipe(Effect.map((rows) => Arr.sort(live(rows, opts), byCreated))),
    put: put("exercise"),
  })
  const plan = PlanRepo.of({
    getPlan: (userId, id) => find("plan", userId, id),
    listPlans,
    listWeeks,
    putPlans: put("plan"),
    putPlanWeeks: put("planWeek"),
    putPlannedSessions: put("plannedSession"),
    putPlannedSets: put("plannedSet"),
    getPlannedSession: (userId, id) =>
      find("plannedSession", userId, id).pipe(Effect.map(Option.filter(isLive))),
    currentPlan,
  })
  const session = SessionRepo.of({
    getSession: (userId, id) => find("session", userId, id),
    listSessions: (userId, range) =>
      all("session", userId).pipe(
        Effect.map((rows) => Arr.sort(Arr.filter(live(rows, liveOnly), inRange(range)), byStarted)),
      ),
    putSessions: put("session"),
    listSetsInRange: (userId, range) =>
      Effect.all([all("session", userId), all("set", userId)]).pipe(
        Effect.map(([sessions, sets]) =>
          pipe(
            live(sessions, liveOnly),
            Arr.filter(inRange(range)),
            Arr.sort(byStarted),
            Arr.flatMap((owner) =>
              pipe(
                live(sets, liveOnly),
                Arr.filter((set) => set.sessionId === owner.id),
                Arr.sort(byOrder),
              ),
            ),
          ),
        ),
      ),
    listSetsForExercise: (userId, exerciseId, limit) =>
      Effect.all([all("session", userId), all("set", userId)]).pipe(
        Effect.map(([sessions, sets]) => {
          const ofExercise = pipe(
            live(sets, liveOnly),
            Arr.filter((set) => set.exerciseId === exerciseId),
          )
          return pipe(
            live(sessions, liveOnly),
            Arr.filter((owner) => ofExercise.some((set) => set.sessionId === owner.id)),
            Arr.sort(Order.flip(byStarted)),
            Arr.take(limit),
            Arr.flatMap((owner) =>
              pipe(
                ofExercise,
                Arr.filter((set) => set.sessionId === owner.id),
                Arr.sort(byOrder),
              ),
            ),
          )
        }),
      ),
    listSessionsForExercise: (userId, exerciseId, limit) =>
      Effect.all([all("session", userId), all("set", userId)]).pipe(
        Effect.map(([sessions, sets]) => {
          const ofExercise = Arr.filter(
            live(sets, liveOnly),
            (set) => set.exerciseId === exerciseId,
          )
          return pipe(
            live(sessions, liveOnly),
            Arr.filter((owner) => ofExercise.some((set) => set.sessionId === owner.id)),
            Arr.sort(Order.flip(byStarted)),
            Arr.take(limit),
          )
        }),
      ),
    listSets: (userId, sessionId) =>
      all("set", userId).pipe(
        Effect.map((rows) =>
          pipe(
            live(rows, liveOnly),
            Arr.filter((set) => set.sessionId === sessionId),
            Arr.sort(byOrder),
          ),
        ),
      ),
    putSets: put("set"),
  })
  return Context.make(ProfileRepo, profile)
    .pipe(Context.add(ExerciseRepo, exercise))
    .pipe(Context.add(PlanRepo, plan))
    .pipe(Context.add(SessionRepo, session))
})

export type Repositories = ProfileRepo | ExerciseRepo | PlanRepo | SessionRepo

export const Repositories = {
  /** The D1 repositories of `@tanren/db`; need `D1Client` (`D1Layer(env.DB)`). */
  layer: DbRepositories.layer,
  /** All four ports on a `MemoryStore` the caller provides (shared with `SyncStore.layerMemory`). */
  layerMemoryNoDeps: Layer.effectContext(makeMemory),
  /** All four ports on a fresh store; `MemoryStore` stays visible for sync. */
  layerMemory: Layer.effectContext(makeMemory).pipe(Layer.provideMerge(MemoryStore.layer)),
}
