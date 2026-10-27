import { Context, Effect, Layer, Ref, Schema } from "effect"

/** Any UUID string (any version). Used where the table is chosen at runtime. */
export const Uuid = Schema.String.check(Schema.isUUID())
export type Uuid = typeof Uuid.Type

export const UserId = Uuid.pipe(Schema.brand("UserId"))
export type UserId = typeof UserId.Type

export const ExerciseId = Uuid.pipe(Schema.brand("ExerciseId"))
export type ExerciseId = typeof ExerciseId.Type

export const PlanId = Uuid.pipe(Schema.brand("PlanId"))
export type PlanId = typeof PlanId.Type

export const PlanWeekId = Uuid.pipe(Schema.brand("PlanWeekId"))
export type PlanWeekId = typeof PlanWeekId.Type

export const PlannedSessionId = Uuid.pipe(Schema.brand("PlannedSessionId"))
export type PlannedSessionId = typeof PlannedSessionId.Type

/** An outbound activity export (not a synced table; ADR-0018). */
export const ActivityExportId = Uuid.pipe(Schema.brand("ActivityExportId"))
export type ActivityExportId = typeof ActivityExportId.Type

export const PlannedSetId = Uuid.pipe(Schema.brand("PlannedSetId"))
export type PlannedSetId = typeof PlannedSetId.Type

export const SessionId = Uuid.pipe(Schema.brand("SessionId"))
export type SessionId = typeof SessionId.Type

export const SetId = Uuid.pipe(Schema.brand("SetId"))
export type SetId = typeof SetId.Type

export const ProgramEnrollmentId = Uuid.pipe(Schema.brand("ProgramEnrollmentId"))
export type ProgramEnrollmentId = typeof ProgramEnrollmentId.Type

export const ProgramDayCompletionId = Uuid.pipe(Schema.brand("ProgramDayCompletionId"))
export type ProgramDayCompletionId = typeof ProgramDayCompletionId.Type

export const ImportedActivityId = Uuid.pipe(Schema.brand("ImportedActivityId"))
export type ImportedActivityId = typeof ImportedActivityId.Type

export const DailyHealthId = Uuid.pipe(Schema.brand("DailyHealthId"))
export type DailyHealthId = typeof DailyHealthId.Type

export const LocationId = Uuid.pipe(Schema.brand("LocationId"))
export type LocationId = typeof LocationId.Type

export interface IdGeneratorShape {
  readonly next: Effect.Effect<Uuid>
}

/** A generated string is always a valid UUID, so a failed check is a defect. */
const toUuid = (raw: string): Effect.Effect<Uuid> => Uuid.makeEffect(raw).pipe(Effect.orDie)

/** `00000000-0000-4000-8000-<n as 12 hex digits>`: a valid v4 UUID for every n < 16^12. */
const testUuid = (n: number): string =>
  `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`

/** Ids come from a service so tests are deterministic. The only impure thing in `shared`. */
export class IdGenerator extends Context.Service<IdGenerator, IdGeneratorShape>()(
  "@tanren/IdGenerator",
) {
  /** Web Crypto exists in Workers, Hermes and browsers; `Effect.sync` keeps it lazy. */
  static readonly layer = Layer.succeed(
    this,
    this.of({ next: Effect.sync(() => crypto.randomUUID()).pipe(Effect.flatMap(toUuid)) }),
  )

  /**
   * Deterministic ids for tests: `00000000-0000-4000-8000-000000000001`, `…002`, … The counter is
   * a `Ref` created when the layer is built, so every fresh build restarts at `…001`.
   */
  static readonly layerTest = Layer.effect(
    this,
    Ref.make(0).pipe(
      Effect.map((counter) =>
        this.of({
          next: Ref.updateAndGet(counter, (n) => n + 1).pipe(
            Effect.map(testUuid),
            Effect.flatMap(toUuid),
          ),
        }),
      ),
    ),
  )
}

/** `yield* newId(SetId)` gives a fresh branded id. `make` is safe here: the Uuid is already validated. */
export const newId = <B extends string>(
  id: Schema.brand<typeof Uuid, B>,
): Effect.Effect<Schema.brand<typeof Uuid, B>["Type"], never, IdGenerator> =>
  IdGenerator.use((generator) => generator.next).pipe(Effect.map((uuid) => id.make(uuid)))
