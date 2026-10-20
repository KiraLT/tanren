import {
  Exercise,
  ExerciseId,
  IdGenerator,
  NotFound,
  Profile,
  Session,
  SessionId,
  SetId,
  type UserId,
  ValidationError,
  WorkoutSet,
} from "@tanren/shared"
import { Array as Arr, DateTime, Effect, Layer, Option } from "effect"
import { HttpApiBuilder, HttpApiError } from "effect/http-api"
import { ExerciseRepo, PersistenceError, PlanRepo, ProfileRepo, SessionRepo } from "../repos"
import { Sync } from "../sync/Sync"
import { Api } from "./Api"
import { CurrentUser } from "./Authentication"

const isOtherError = <E>(error: E): error is Exclude<E, PersistenceError> =>
  !(error instanceof PersistenceError)

/** `PersistenceError` is internal: log it and answer 500 without details. */
const internal = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, Exclude<E, PersistenceError> | HttpApiError.InternalServerError, R> =>
  Effect.catch(
    effect,
    (
      error,
    ): Effect.Effect<never, Exclude<E, PersistenceError> | HttpApiError.InternalServerError> =>
      isOtherError(error)
        ? Effect.fail(error)
        : Effect.logError("persistence failure", error).pipe(
            Effect.andThen(Effect.fail(new HttpApiError.InternalServerError())),
          ),
  )

/** Soft-deleted rows read as missing (DM §9). */
const liveOr =
  (entity: NotFound["entity"], id: string) =>
  <A extends { readonly deletedAt: Option.Option<DateTime.Utc> }>(row: Option.Option<A>) =>
    Option.match(
      Option.filter(row, (r) => Option.isNone(r.deletedAt)),
      {
        onNone: () => Effect.fail(new NotFound({ entity, id })),
        onSome: Effect.succeed,
      },
    )

const userId = CurrentUser.use((user) => Effect.succeed(user.userId))

const stamps = Effect.gen(function* () {
  const now = yield* DateTime.now
  return { createdAt: now, updatedAt: now, deletedAt: Option.none() }
})

const HealthLive = HttpApiBuilder.group(Api, "health", (handlers) =>
  handlers.handle("health", () => Effect.succeed({ ok: true })),
)

const ProfileLive = HttpApiBuilder.group(
  Api,
  "profile",
  Effect.fn(function* (handlers) {
    const repo = yield* ProfileRepo
    return handlers.handleAll({
      get: () =>
        internal(
          Effect.gen(function* () {
            const user = yield* userId
            return yield* liveOr("profile", user)(yield* repo.get(user))
          }),
        ),
      put: ({ payload }) =>
        internal(
          Effect.gen(function* () {
            const user = yield* userId
            const now = yield* DateTime.now
            const existing = yield* repo.get(user)
            const profile = yield* Profile.makeEffect({
              ...payload,
              id: user,
              userId: user,
              createdAt: Option.match(existing, { onNone: () => now, onSome: (p) => p.createdAt }),
              updatedAt: now,
              deletedAt: Option.none(),
            }).pipe(Effect.mapError(ValidationError.fromIssue))
            yield* repo.put(user, [profile])
            return profile
          }),
        ),
    })
  }),
)

const ExercisesLive = HttpApiBuilder.group(
  Api,
  "exercises",
  Effect.fn(function* (handlers) {
    const repo = yield* ExerciseRepo
    const ids = yield* IdGenerator
    const load = (user: Exercise["userId"], id: ExerciseId) =>
      repo.get(user, id).pipe(Effect.flatMap(liveOr("exercise", id)))
    const save = (user: Exercise["userId"], fields: Exercise) =>
      Exercise.makeEffect(fields).pipe(
        Effect.mapError(ValidationError.fromIssue),
        Effect.tap((row) => repo.put(user, [row])),
      )
    return handlers.handleAll({
      list: () =>
        internal(Effect.flatMap(userId, (user) => repo.list(user, { includeDeleted: false }))),
      get: ({ params }) => internal(Effect.flatMap(userId, (user) => load(user, params.id))),
      create: ({ payload }) =>
        internal(
          Effect.gen(function* () {
            const user = yield* userId
            const id = ExerciseId.make(yield* ids.next)
            return yield* save(user, { ...payload, ...(yield* stamps), id, userId: user })
          }),
        ),
      update: ({ params, payload }) =>
        internal(
          Effect.gen(function* () {
            const user = yield* userId
            const row = yield* load(user, params.id)
            return yield* save(user, { ...row, ...payload, updatedAt: yield* DateTime.now })
          }),
        ),
      remove: ({ params }) =>
        internal(
          Effect.gen(function* () {
            const user = yield* userId
            const row = yield* load(user, params.id)
            const now = yield* DateTime.now
            yield* save(user, { ...row, updatedAt: now, deletedAt: Option.some(now) })
          }),
        ),
    })
  }),
)

const SessionsLive = HttpApiBuilder.group(
  Api,
  "sessions",
  Effect.fn(function* (handlers) {
    const repo = yield* SessionRepo
    const ids = yield* IdGenerator
    const load = (user: Session["userId"], id: SessionId) =>
      repo.getSession(user, id).pipe(Effect.flatMap(liveOr("session", id)))
    const save = (user: Session["userId"], fields: Session) =>
      Session.makeEffect(fields).pipe(
        Effect.mapError(ValidationError.fromIssue),
        Effect.tap((row) => repo.putSessions(user, [row])),
      )
    return handlers.handleAll({
      list: ({ query }) =>
        internal(
          Effect.flatMap(userId, (user) =>
            repo.listSessions(user, {
              from: query.from,
              to: query.to,
            }),
          ),
        ),
      get: ({ params }) => internal(Effect.flatMap(userId, (user) => load(user, params.id))),
      create: ({ payload }) =>
        internal(
          Effect.gen(function* () {
            const user = yield* userId
            const id = SessionId.make(yield* ids.next)
            return yield* save(user, { ...payload, ...(yield* stamps), id, userId: user })
          }),
        ),
      update: ({ params, payload }) =>
        internal(
          Effect.gen(function* () {
            const user = yield* userId
            const row = yield* load(user, params.id)
            return yield* save(user, { ...row, ...payload, updatedAt: yield* DateTime.now })
          }),
        ),
      remove: ({ params }) =>
        internal(
          Effect.gen(function* () {
            const user = yield* userId
            const row = yield* load(user, params.id)
            const now = yield* DateTime.now
            yield* save(user, { ...row, updatedAt: now, deletedAt: Option.some(now) })
          }),
        ),
      sets: ({ params }) =>
        internal(
          Effect.gen(function* () {
            const user = yield* userId
            yield* load(user, params.id)
            return yield* repo.listSets(user, params.id)
          }),
        ),
    })
  }),
)

const SetsLive = HttpApiBuilder.group(
  Api,
  "sets",
  Effect.fn(function* (handlers) {
    const repo = yield* SessionRepo
    const ids = yield* IdGenerator
    const liveSession = (user: UserId, sessionId: SessionId) =>
      repo.getSession(user, sessionId).pipe(Effect.flatMap(liveOr("session", sessionId)))
    /** A set is addressed through its session: live session, then the set among its live sets. */
    const load = (user: UserId, sessionId: SessionId, id: SetId) =>
      liveSession(user, sessionId).pipe(
        Effect.andThen(repo.listSets(user, sessionId)),
        Effect.map(Arr.findFirst((set) => set.id === id)),
        Effect.flatMap(liveOr("set", id)),
      )
    const save = (user: UserId, fields: WorkoutSet) =>
      WorkoutSet.makeEffect(fields).pipe(
        Effect.mapError(ValidationError.fromIssue),
        Effect.tap((row) => repo.putSets(user, [row])),
      )
    return handlers.handleAll({
      create: ({ params, payload }) =>
        internal(
          Effect.gen(function* () {
            if (payload.sessionId !== params.id) {
              return yield* new ValidationError({
                message: "sessionId in the body must match the path",
                issues: [{ path: ["sessionId"], message: "must equal the session id in the path" }],
              })
            }
            const user = yield* userId
            yield* liveSession(user, params.id)
            const id = SetId.make(yield* ids.next)
            return yield* save(user, { ...payload, ...(yield* stamps), id, userId: user })
          }),
        ),
      update: ({ params, payload }) =>
        internal(
          Effect.gen(function* () {
            const user = yield* userId
            const row = yield* load(user, params.id, params.setId)
            return yield* save(user, { ...row, ...payload, updatedAt: yield* DateTime.now })
          }),
        ),
      remove: ({ params }) =>
        internal(
          Effect.gen(function* () {
            const user = yield* userId
            const row = yield* load(user, params.id, params.setId)
            const now = yield* DateTime.now
            yield* save(user, { ...row, updatedAt: now, deletedAt: Option.some(now) })
          }),
        ),
    })
  }),
)

const PlansLive = HttpApiBuilder.group(
  Api,
  "plans",
  Effect.fn(function* (handlers) {
    const repo = yield* PlanRepo
    return handlers.handleAll({
      list: () =>
        internal(Effect.flatMap(userId, (user) => repo.listPlans(user, { includeDeleted: false }))),
      current: () =>
        internal(
          Effect.gen(function* () {
            const current = yield* repo.currentPlan(yield* userId)
            return yield* Option.match(current, {
              onNone: () => Effect.fail(new HttpApiError.NotFound()),
              onSome: Effect.succeed,
            })
          }),
        ),
    })
  }),
)

const SyncLive = HttpApiBuilder.group(
  Api,
  "sync",
  Effect.fn(function* (handlers) {
    // Destructured: a `.push(` member call trips the noMutation plugin's array-method check.
    const { push, pull } = yield* Sync
    return handlers.handleAll({
      push: ({ payload }) => internal(Effect.flatMap(userId, (user) => push(user, payload))),
      pull: ({ payload }) => internal(Effect.flatMap(userId, (user) => pull(user, payload))),
    })
  }),
)

/** Every group's handlers; needs the repositories, `Sync` and `IdGenerator`. */
export const HandlersLive = Layer.mergeAll(
  HealthLive,
  ProfileLive,
  ExercisesLive,
  SessionsLive,
  SetsLive,
  PlansLive,
  SyncLive,
)
