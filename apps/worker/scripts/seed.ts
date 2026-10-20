/**
 * Local seed runner (docs/design/local-dev.md §1): fills the local D1 with a fake month for the
 * dev user. Flags: `--seed <n>` (default 1), `--end <YYYY-MM-DD>` (default today, UTC).
 * Entry point: this is where the Effect program is run.
 */
import {
  type D1Database,
  D1Layer,
  ExerciseRepo,
  PlanRepo,
  ProfileRepo,
  Repositories,
  SEED_USER_ID,
  SessionRepo,
  seededIdGenerator,
  seedMonth,
} from "@tanren/db"
import { LocalDate, SYNC_TABLE_ORDER } from "@tanren/shared"
import { Array as Arr, DateTime, Effect, Layer, Option, Schema } from "effect"
import { getPlatformProxy } from "wrangler"

const CHUNK_SIZE = 100

const flag = (name: string): Option.Option<string> =>
  Option.some(process.argv.indexOf(`--${name}`)).pipe(
    Option.filter((index) => index >= 0),
    Option.flatMap((index) => Option.fromNullishOr(process.argv[index + 1])),
  )

const parseOptions = Effect.gen(function* () {
  const seed = yield* Option.match(flag("seed"), {
    onNone: () => Effect.succeed(1),
    onSome: Schema.decodeUnknownEffect(Schema.NumberFromString),
  })
  const endDate = yield* Option.match(flag("end"), {
    onNone: () =>
      DateTime.now.pipe(
        Effect.flatMap((now) => LocalDate.makeEffect(DateTime.formatIsoDateUtc(now))),
      ),
    onSome: Schema.decodeUnknownEffect(LocalDate),
  })
  return { seed, endDate }
})

/** Local D1 from wrangler's platform proxy, always local (`remoteBindings: false`). */
const withLocalD1 = <A, E, R>(use: (db: D1Database) => Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.promise(() =>
      getPlatformProxy<{ readonly DB: D1Database }>({
        configPath: `${import.meta.dirname}/../wrangler.jsonc`,
        persist: { path: `${import.meta.dirname}/../.wrangler/state/v3` },
        remoteBindings: false,
      }),
    ),
    (proxy) => use(proxy.env.DB),
    (proxy) => Effect.promise(() => proxy.dispose()),
  )

const program = Effect.gen(function* () {
  const { seed, endDate } = yield* parseOptions
  const userId = SEED_USER_ID
  const data = yield* seedMonth({ userId, seed, endDate })
  const profile = yield* ProfileRepo
  const exercise = yield* ExerciseRepo
  const plan = yield* PlanRepo
  const session = yield* SessionRepo

  const chunked = <A>(
    rows: ReadonlyArray<A>,
    put: (chunk: ReadonlyArray<A>) => Effect.Effect<void, unknown>,
  ) => Effect.forEach(Arr.chunksOf(rows, CHUNK_SIZE), put, { discard: true })

  const writes = {
    profile: chunked(data.profile, (rows) => profile.put(userId, rows)),
    exercise: chunked(data.exercise, (rows) => exercise.put(userId, rows)),
    plan: chunked(data.plan, (rows) => plan.putPlans(userId, rows)),
    planWeek: chunked(data.planWeek, (rows) => plan.putPlanWeeks(userId, rows)),
    plannedSession: chunked(data.plannedSession, (rows) => plan.putPlannedSessions(userId, rows)),
    plannedSet: chunked(data.plannedSet, (rows) => plan.putPlannedSets(userId, rows)),
    session: chunked(data.session, (rows) => session.putSessions(userId, rows)),
    set: chunked(data.set, (rows) => session.putSets(userId, rows)),
  }
  // Parents first: foreign keys are enforced by D1.
  yield* Effect.forEach(SYNC_TABLE_ORDER, (table) => writes[table], { discard: true })
  yield* Effect.logInfo(
    `seeded ${userId} (seed ${seed}, end ${endDate}): ${SYNC_TABLE_ORDER.map((table) => `${table} ${data[table].length}`).join(", ")}`,
  )
})

await Effect.runPromise(
  withLocalD1((db) =>
    program.pipe(
      Effect.provide(
        Layer.mergeAll(Repositories.layer, seededIdGenerator).pipe(Layer.provideMerge(D1Layer(db))),
      ),
    ),
  ),
)
