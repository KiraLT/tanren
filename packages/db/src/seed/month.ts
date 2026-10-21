/**
 * A pure, deterministic month of training data for the fixed dev user (docs/design/db.md §7).
 * Randomness comes from `Random` seeded by `Random.withSeed`, ids from `IdGenerator`, and every
 * timestamp from `endDate`; nothing reads the clock, so `(seed, endDate)` fixes the output.
 */
import {
  CatalogId,
  Exercise,
  ExerciseId,
  type IdGenerator,
  LOCATION_PRESETS,
  LocalDate,
  LocationId,
  newId,
  Plan,
  PlanId,
  PlannedSession,
  PlannedSessionId,
  PlannedSet,
  PlannedSetId,
  PlanWeek,
  PlanWeekId,
  Profile,
  type ProgramDayCompletion,
  type ProgramEnrollment,
  Reps,
  type RepTarget,
  Rpe,
  Session,
  SessionId,
  SetId,
  TimeZone,
  UserId,
  WeightKg,
  WorkoutSet,
} from "@tanren/shared"
import { Array as Arr, DateTime, Effect, Match, Option, Random } from "effect"
import {
  DELOAD_WEEK,
  EXERCISES,
  type ExerciseKey,
  type ExerciseSpec,
  PLAN_WEEK_INTENTS,
  PLAN_WEEKS,
  type RepSpec,
  SESSION_NOTES,
  SESSION_TEMPLATES,
  SET_NOTES,
  type SessionTemplate,
} from "./catalog"

/** The fixed dev user (docs/design/local-dev.md). A valid UUID literal, covered by the tests. */
export const SEED_USER_ID: UserId = UserId.make("00000000-0000-4000-8000-000000000001")

export interface SeedOptions {
  readonly userId: UserId
  /** Fixes every random draw and id. */
  readonly seed: number
  /** Last day of the 30-day window (inclusive). */
  readonly endDate: LocalDate
}

/** One readonly array per synced table, built with the shared entity constructors. */
export interface SeedData {
  readonly profile: ReadonlyArray<Profile>
  readonly exercise: ReadonlyArray<Exercise>
  readonly plan: ReadonlyArray<Plan>
  readonly planWeek: ReadonlyArray<PlanWeek>
  readonly plannedSession: ReadonlyArray<PlannedSession>
  readonly plannedSet: ReadonlyArray<PlannedSet>
  readonly session: ReadonlyArray<Session>
  readonly set: ReadonlyArray<WorkoutSet>
  /** Empty: the seeded month has no program progress. */
  readonly programEnrollment: ReadonlyArray<ProgramEnrollment>
  readonly programDayCompletion: ReadonlyArray<ProgramDayCompletion>
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const SPAN_DAYS = 30
const MISSED_SESSIONS = 2

// Time helpers: millisecond arithmetic on UTC midnights.

const instant = (ms: number): DateTime.Utc => DateTime.makeUnsafe(ms)

const parseDay = (date: LocalDate): number =>
  Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)))

/** 0 = Monday. The Unix epoch was a Thursday. */
const weekdayIndex = (ms: number): number => (Math.floor(ms / DAY) + 3) % 7

const localDate = (ms: number) =>
  LocalDate.makeEffect(DateTime.formatIsoDateUtc(instant(ms))).pipe(Effect.orDie)

// Branded values; every input is valid by construction, so a failure is a defect.

const toWeight = (kg: number) => WeightKg.makeEffect(kg).pipe(Effect.orDie)
const toReps = (reps: number) => Reps.makeEffect(reps).pipe(Effect.orDie)
const toRpe = (rpe: number) => Rpe.makeEffect(rpe).pipe(Effect.orDie)

const need = <A>(value: Option.Option<A>, what: string): Effect.Effect<A> =>
  Option.match(value, {
    onNone: () => Effect.die(`seed: missing ${what}`),
    onSome: (found) => Effect.succeed(found),
  })

const maybeNote = (probability: number, notes: readonly [string, ...Array<string>]) =>
  Random.next.pipe(
    Effect.flatMap((roll) =>
      roll < probability
        ? Random.choice(notes).pipe(Effect.map((note) => Option.some(note)))
        : Effect.succeed(Option.none<string>()),
    ),
  )

// Loads

const snap = (value: number, step: number): number => Math.round(value / step) * step

/** The deload week trains at the week-2 load; the week after it adds one more step. */
const progressedWeeks = (weekIndex: number): number =>
  weekIndex < DELOAD_WEEK ? weekIndex : weekIndex === DELOAD_WEEK ? DELOAD_WEEK - 1 : weekIndex - 1

const loadFor = (exercise: ExerciseSpec, weekIndex: number, intensity: number): number =>
  exercise.baseKg === 0
    ? 0
    : snap(
        (exercise.baseKg + exercise.weeklyKg * progressedWeeks(weekIndex)) *
          intensity *
          (weekIndex === DELOAD_WEEK ? 0.85 : 1),
        exercise.weeklyKg > 0 ? 2.5 : 0.25,
      )

// Calendar

interface Window {
  readonly startMs: number
  readonly endMs: number
  /**
   * First Monday of the plan: the last plan week is the one that holds `endMs`. (Counting from
   * `startMs` instead put a Monday end date in a sixth week that did not exist.)
   */
  readonly planStartMs: number
}

const windowOf = (endDate: LocalDate): Window => {
  const endMs = parseDay(endDate)
  const startMs = endMs - (SPAN_DAYS - 1) * DAY
  const endWeekMs = endMs - weekdayIndex(endMs) * DAY
  return { startMs, endMs, planStartMs: endWeekMs - (PLAN_WEEKS - 1) * 7 * DAY }
}

const weekIndexOf = (window: Window, ms: number): number =>
  Math.min(PLAN_WEEKS - 1, Math.max(0, Math.floor((ms - window.planStartMs) / (7 * DAY))))

/**
 * The sessions of plan week `weekIndex`. The week that holds `endDate` always trains on the end
 * weekday, so Today has a planned session to log on the day the seed is run: when the weekly
 * template skips that weekday, the nearest session (the later one on a tie) moves onto it.
 */
const templatesForWeek = (window: Window, weekIndex: number): ReadonlyArray<SessionTemplate> => {
  const endDay = weekdayIndex(window.endMs)
  if (
    weekIndex !== weekIndexOf(window, window.endMs) ||
    SESSION_TEMPLATES.some((template) => template.dayOffset === endDay)
  ) {
    return SESSION_TEMPLATES
  }
  const distance = (template: SessionTemplate) => Math.abs(template.dayOffset - endDay)
  const nearest = SESSION_TEMPLATES.reduce((best, template) =>
    distance(template) < distance(best) ||
    (distance(template) === distance(best) && template.dayOffset > best.dayOffset)
      ? template
      : best,
  )
  return SESSION_TEMPLATES.map((template) =>
    template === nearest ? { ...template, dayOffset: endDay } : template,
  )
}

// Rows

const stamp = (userId: UserId, ms: number) => ({
  userId,
  createdAt: instant(ms),
  updatedAt: instant(ms),
  deletedAt: Option.none<DateTime.Utc>(),
})

interface Stamp {
  readonly userId: UserId
  readonly ms: number
}

/**
 * Fixed location ids: drawing them from the seeded `Random` shifted every later seeded id, and a
 * stable id keeps `db:seed` over an existing DB idempotent.
 */
const GYM_ID = LocationId.make("00000000-0000-4000-8000-0000000000a1")
const HOME_ID = LocationId.make("00000000-0000-4000-8000-0000000000a2")

/** Two locations (equipment.md §3): "Gym" (commercialGym preset, active) and "Home". */
const buildProfile = ({ userId, ms }: Stamp) =>
  Effect.gen(function* () {
    const { commercialGym, home } = LOCATION_PRESETS
    return yield* Profile.makeEffect({
      id: userId,
      ...stamp(userId, ms),
      goals: [
        { kind: "strength", note: Option.some("Squat 140, bench 100, deadlift 180 by spring.") },
        { kind: "hypertrophy", note: Option.none() },
      ],
      constraints: ["Left shoulder gets tight: no overhead work above RPE 9."],
      availableDays: ["mon", "wed", "fri", "sat"],
      locations: [
        { id: GYM_ID, name: commercialGym.name, equipment: commercialGym.equipment },
        { id: HOME_ID, name: home.name, equipment: home.equipment },
      ],
      activeLocationId: Option.some(GYM_ID),
      timezone: TimeZone.make("Europe/Berlin"),
    }).pipe(Effect.orDie)
  })

interface ExerciseBuild {
  readonly spec: ExerciseSpec
  readonly row: Exercise
}

const buildExercises = ({ userId, ms }: Stamp) =>
  Effect.forEach(EXERCISES, (spec) =>
    Effect.gen(function* () {
      const id = yield* newId(ExerciseId)
      const row = yield* Exercise.makeEffect({
        id,
        ...stamp(userId, ms),
        name: spec.name,
        aliases: spec.aliases,
        muscleGroups: spec.muscleGroups,
        notes: Option.fromNullishOr(spec.notes),
        catalogId: Option.some(yield* CatalogId.makeEffect(spec.catalogId).pipe(Effect.orDie)),
      }).pipe(Effect.orDie)
      return { spec, row }
    }),
  )

const repTarget = (spec: RepSpec): Effect.Effect<RepTarget> =>
  Match.value(spec).pipe(
    Match.tag("Exact", ({ reps }) =>
      toReps(reps).pipe(Effect.map((exactReps): RepTarget => ({ _tag: "Exact", reps: exactReps }))),
    ),
    Match.tag("Range", ({ min, max }) =>
      Effect.all([toReps(min), toReps(max)]).pipe(
        Effect.map(
          ([minReps, maxReps]): RepTarget => ({ _tag: "Range", min: minReps, max: maxReps }),
        ),
      ),
    ),
    Match.exhaustive,
  )

interface PlanContext {
  readonly userId: UserId
  readonly createdMs: number
  readonly exercises: ReadonlyArray<ExerciseBuild>
}

interface PlannedSessionBuild {
  readonly row: PlannedSession
  readonly sets: ReadonlyArray<PlannedSet>
  readonly weekIndex: number
  readonly scheduledMs: number
}

const buildPlannedSet = (
  context: PlanContext,
  plannedSessionId: PlannedSession["id"],
  weekIndex: number,
  slot: { readonly key: ExerciseKey; readonly spec: SessionTemplate["exercises"][number] },
  order: number,
) =>
  Effect.gen(function* () {
    const exercise = yield* need(
      Arr.findFirst(context.exercises, (e) => e.spec.key === slot.key),
      `exercise ${slot.key}`,
    )
    const id = yield* newId(PlannedSetId)
    const load = loadFor(exercise.spec, weekIndex, slot.spec.intensity)
    return yield* PlannedSet.makeEffect({
      id,
      ...stamp(context.userId, context.createdMs),
      plannedSessionId,
      exerciseId: exercise.row.id,
      order,
      targetWeightKg: load === 0 ? Option.none() : Option.some(yield* toWeight(load)),
      targetReps: yield* repTarget(slot.spec.reps),
      targetRpe: Option.some(yield* toRpe(weekIndex === DELOAD_WEEK ? 6 : 8)),
      restSeconds: Option.some(slot.spec.restSeconds),
      note: Option.fromNullishOr(slot.spec.note),
    }).pipe(Effect.orDie)
  })

const buildPlannedSession = (
  context: PlanContext,
  week: { readonly id: PlanWeek["id"]; readonly index: number; readonly startMs: number },
  template: SessionTemplate,
  order: number,
) =>
  Effect.gen(function* () {
    const id = yield* newId(PlannedSessionId)
    const scheduledMs = week.startMs + template.dayOffset * DAY
    const slots = Arr.flatMap(template.exercises, (spec) =>
      Arr.replicate(spec, spec.sets).map((slotSpec) => ({ key: slotSpec.key, spec: slotSpec })),
    )
    const sets = yield* Effect.forEach(slots, (slot, setOrder) =>
      buildPlannedSet(context, id, week.index, slot, setOrder),
    )
    const row = yield* PlannedSession.makeEffect({
      id,
      ...stamp(context.userId, context.createdMs),
      planWeekId: week.id,
      order,
      name: template.name,
      scheduledDate: Option.some(yield* localDate(scheduledMs)),
      notes: Option.none(),
    }).pipe(Effect.orDie)
    return { row, sets, weekIndex: week.index, scheduledMs } satisfies PlannedSessionBuild
  })

const buildPlan = (context: PlanContext, window: Window) =>
  Effect.gen(function* () {
    const planId = yield* newId(PlanId)
    const plan = yield* Plan.makeEffect({
      id: planId,
      ...stamp(context.userId, context.createdMs),
      name: "Upper/Lower strength block",
      goal: "Add 2.5 kg a week to the main lifts, with a deload in week 4.",
      startDate: yield* localDate(window.planStartMs),
      status: "active",
    }).pipe(Effect.orDie)
    const weeks = yield* Effect.forEach(Arr.range(0, PLAN_WEEKS - 1), (index) =>
      Effect.gen(function* () {
        const id = yield* newId(PlanWeekId)
        const startMs = window.planStartMs + index * 7 * DAY
        const row = yield* PlanWeek.makeEffect({
          id,
          ...stamp(context.userId, context.createdMs),
          planId,
          weekStart: yield* localDate(startMs),
          intent: Option.some(
            index === DELOAD_WEEK ? PLAN_WEEK_INTENTS.deload : PLAN_WEEK_INTENTS.build,
          ),
        }).pipe(Effect.orDie)
        const sessions = yield* Effect.forEach(templatesForWeek(window, index), (template, order) =>
          buildPlannedSession(context, { id, index, startMs }, template, order),
        )
        return { row, sessions }
      }),
    )
    return { plan, weeks }
  })

// Logging

/** What one logged set aims for; reps are drawn between `minReps` and `maxReps`. */
interface SetTarget {
  readonly exerciseId: ExerciseId
  readonly plannedSetId: Option.Option<PlannedSetId>
  readonly weightKg: number
  readonly minReps: number
  readonly maxReps: number
  readonly deload: boolean
}

const targetOf = (set: PlannedSet, deload: boolean): SetTarget => {
  const bounds = Match.value(set.targetReps).pipe(
    Match.tag("Exact", ({ reps }) => ({ minReps: reps - 1, maxReps: reps })),
    Match.tag("Range", ({ min, max }) => ({ minReps: min, maxReps: max })),
    Match.exhaustive,
  )
  return {
    exerciseId: set.exerciseId,
    plannedSetId: Option.some(set.id),
    weightKg: Option.getOrElse(set.targetWeightKg, () => 0),
    ...bounds,
    deload,
  }
}

interface SessionLog {
  readonly userId: UserId
  readonly dayMs: number
  readonly plannedSessionId: Option.Option<PlannedSession["id"]>
  readonly notes: Option.Option<string>
  readonly targets: ReadonlyArray<SetTarget>
}

const logSession = (input: SessionLog) =>
  Effect.gen(function* () {
    const sessionId = yield* newId(SessionId)
    const startMs = input.dayMs + 17 * HOUR + (yield* Random.nextIntBetween(0, 60)) * MINUTE
    const finishMs =
      startMs + (input.targets.length * 3 + (yield* Random.nextIntBetween(8, 20))) * MINUTE
    const session = yield* Session.makeEffect({
      id: sessionId,
      ...stamp(input.userId, finishMs),
      startedAt: instant(startMs),
      finishedAt: Option.some(instant(finishMs)),
      plannedSessionId: input.plannedSessionId,
      notes: input.notes,
    }).pipe(Effect.orDie)
    const sets = yield* Effect.forEach(input.targets, (target, order) =>
      Effect.gen(function* () {
        const id = yield* newId(SetId)
        const loggedMs = startMs + (order * 3 + 2) * MINUTE
        const reps = yield* Random.nextIntBetween(Math.max(0, target.minReps), target.maxReps)
        const rpe = yield* Random.nextIntBetween(target.deload ? 13 : 14, target.deload ? 15 : 19)
        return yield* WorkoutSet.makeEffect({
          id,
          ...stamp(input.userId, loggedMs),
          sessionId,
          exerciseId: target.exerciseId,
          order,
          weightKg: yield* toWeight(target.weightKg),
          reps: yield* toReps(reps),
          rpe: Option.some(yield* toRpe(rpe / 2)),
          note: yield* maybeNote(0.06, SET_NOTES),
          plannedSetId: target.plannedSetId,
          loggedAt: instant(loggedMs),
        }).pipe(Effect.orDie)
      }),
    )
    return { session, sets }
  })

/** An off-plan session: arms and core on a Tuesday or Thursday in the second half of the window. */
const unplannedTargets = (
  exercises: ReadonlyArray<ExerciseBuild>,
  weekIndex: number,
): Effect.Effect<ReadonlyArray<SetTarget>> =>
  Effect.forEach(["curl", "lateralRaise", "legRaise"] as const, (key) =>
    need(
      Arr.findFirst(exercises, (e) => e.spec.key === key),
      `exercise ${key}`,
    ),
  ).pipe(
    Effect.map((found) =>
      Arr.flatMap(found, ({ spec, row }) =>
        Arr.replicate(
          {
            exerciseId: row.id,
            plannedSetId: Option.none<PlannedSetId>(),
            weightKg: loadFor(spec, weekIndex, 1),
            minReps: spec.key === "legRaise" ? 8 : 10,
            maxReps: 12,
            deload: false,
          },
          3,
        ),
      ),
    ),
  )

// Entry point

const build = (options: SeedOptions) =>
  Effect.gen(function* () {
    const { userId } = options
    const window = windowOf(options.endDate)
    const createdMs = window.planStartMs - 7 * DAY + 8 * HOUR
    const base = { userId, ms: createdMs }

    const profile = yield* buildProfile(base)
    const exercises = yield* buildExercises(base)
    const context: PlanContext = { userId, createdMs, exercises }
    const { plan, weeks } = yield* buildPlan(context, window)
    const planned = Arr.flatMap(weeks, (week) => week.sessions)

    // Scheduled before the end date: two of them are skipped, the rest are logged. The session on
    // the end date stays planned and unlogged, so Today shows it as the one to do.
    const inWindow = Arr.filter(
      planned,
      (s) => s.scheduledMs >= window.startMs && s.scheduledMs < window.endMs,
    )
    const missed = Arr.take(yield* Random.shuffle(inWindow), MISSED_SESSIONS).map((s) => s.row.id)
    const logged = yield* Effect.forEach(
      Arr.filter(inWindow, (s) => !missed.includes(s.row.id)),
      (s) =>
        Effect.gen(function* () {
          return yield* logSession({
            userId,
            dayMs: s.scheduledMs,
            plannedSessionId: Option.some(s.row.id),
            notes: yield* maybeNote(0.25, SESSION_NOTES),
            targets: s.sets.map((set) => targetOf(set, s.weekIndex === DELOAD_WEEK)),
          })
        }),
    )

    // Never on the end date: nothing but the planned session may be logged there.
    const offDays = Arr.filter(Arr.range(10, SPAN_DAYS - 2), (day) =>
      [1, 3].includes(weekdayIndex(window.startMs + day * DAY)),
    )
    const offDay = yield* Random.choice(offDays).pipe(Effect.orDie)
    const offDayMs = window.startMs + offDay * DAY
    const unplanned = yield* logSession({
      userId,
      dayMs: offDayMs,
      plannedSessionId: Option.none(),
      notes: Option.some("Unplanned arms and core, felt like it."),
      targets: yield* unplannedTargets(exercises, weekIndexOf(window, offDayMs)),
    })

    // One logged set was deleted after the fact (soft delete, same `updatedAt` bump).
    const allSets = Arr.flatMap([...logged, unplanned], (entry) => entry.sets)
    const deletedIndex = yield* Random.nextIntBetween(0, allSets.length - 1)
    const sets = yield* Effect.forEach(allSets, (set, index) =>
      index === deletedIndex
        ? WorkoutSet.makeEffect({
            ...set,
            deletedAt: Option.some(instant(DateTime.toEpochMillis(set.loggedAt) + MINUTE)),
            updatedAt: instant(DateTime.toEpochMillis(set.loggedAt) + MINUTE),
          }).pipe(Effect.orDie)
        : Effect.succeed(set),
    )

    return {
      profile: [profile],
      exercise: exercises.map((e) => e.row),
      plan: [plan],
      planWeek: weeks.map((week) => week.row),
      plannedSession: planned.map((s) => s.row),
      plannedSet: Arr.flatMap(planned, (s) => s.sets),
      session: [...logged, unplanned].map((entry) => entry.session),
      set: sets,
      programEnrollment: [],
      programDayCompletion: [],
    } satisfies SeedData
  })

/**
 * One month of sessions for `userId` ending on `endDate`: a 5-week upper/lower plan (week 4 is a
 * deload), 14 exercises, 14 or 15 logged sessions linked to planned ones, 2 missed, 1
 * unplanned, one soft-deleted set. The plan always has an unlogged session on `endDate`. Provide `seededIdGenerator` for reproducible ids.
 */
export const seedMonth = (options: SeedOptions): Effect.Effect<SeedData, never, IdGenerator> =>
  build(options).pipe(Random.withSeed(options.seed))
