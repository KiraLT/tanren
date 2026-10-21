import { Profile, type ProfilePatch, ProfileRow, TimeZone } from "@tanren/shared"
import {
  Array as Arr,
  Context,
  Data,
  DateTime,
  Effect,
  Layer,
  Option,
  Schema,
  type SchemaIssue,
  Semaphore,
} from "effect"
import { CurrentUser, ownerId } from "./CurrentUser"
import { decodeRecords, LocalStore } from "./LocalStore"
import type { StoreError } from "./SqlDriver"

/** Internal: a save would produce an invalid profile (e.g. an active id that names no location). */
export class ProfileInvalid extends Data.TaggedError("ProfileInvalid")<{
  readonly issue: SchemaIssue.Issue
}> {}

export interface ProfileRepoShape {
  /** The owner's profile row (`id = userId`), if any; a tombstoned row counts as none. */
  readonly get: Effect.Effect<Option.Option<Profile>, StoreError>
  /**
   * Upserts the whole row dirty (synced by SyncEngine). Creates the profile when none exists:
   * goals/constraints/availableDays/locations empty, timezone = device zone, id = userId = owner.
   */
  readonly save: (patch: ProfilePatch) => Effect.Effect<Profile, StoreError | ProfileInvalid>
  /**
   * Read-modify-write under the repo's lock, so concurrent edits never lose one another: `f` gets
   * the current profile and returns the patch to save, or `None` to write nothing. Succeeds with
   * the saved profile, or the unchanged one when `f` returned `None`.
   */
  readonly modify: (
    f: (current: Option.Option<Profile>) => Option.Option<ProfilePatch>,
  ) => Effect.Effect<Option.Option<Profile>, StoreError | ProfileInvalid>
}

/** The device zone as an IANA name; an offset-only zone (rare) falls back to UTC. */
const deviceTimeZone = (zone: DateTime.TimeZone): TimeZone =>
  Option.getOrElse(Schema.decodeUnknownOption(TimeZone)(DateTime.zoneToString(zone)), () =>
    TimeZone.make("UTC"),
  )

export class ProfileRepo extends Context.Service<ProfileRepo, ProfileRepoShape>()(
  "@tanren/ProfileRepo",
) {
  /** Needs `LocalStore`, `CurrentUser` and the device zone (`DateTime.CurrentTimeZone`). */
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const store = yield* LocalStore
      const zone = yield* DateTime.CurrentTimeZone
      const owner = ownerId(yield* CurrentUser)

      const get = Effect.gen(function* () {
        const userId = yield* owner
        const rows = yield* store
          .all({
            sql: `SELECT * FROM "profile" WHERE "id" = ? AND "deletedAt" IS NULL LIMIT 1`,
            params: [userId],
          })
          .pipe(Effect.flatMap(decodeRecords(ProfileRow)))
        return Arr.head(rows)
      })

      // One permit: every read-modify-write of the profile runs alone (`save` and `modify`).
      const lock = yield* Semaphore.make(1)

      const write = (current: Option.Option<Profile>, patch: ProfilePatch) =>
        Effect.gen(function* () {
          const userId = yield* owner
          const now = yield* DateTime.now
          const base = Option.match(current, {
            onNone: () => ({
              id: userId,
              userId,
              createdAt: now,
              deletedAt: Option.none(),
              goals: [],
              constraints: [],
              availableDays: [],
              locations: [],
              activeLocationId: Option.none(),
              timezone: deviceTimeZone(zone),
            }),
            onSome: (profile) => ({ ...profile }),
          })
          const profile = yield* Profile.makeEffect({ ...base, ...patch, updatedAt: now }).pipe(
            Effect.mapError((issue) => new ProfileInvalid({ issue })),
          )
          yield* store.write([{ table: "profile", row: profile }], { dirty: true })
          return profile
        })

      const save = (patch: ProfilePatch) =>
        lock.withPermits(1)(Effect.flatMap(get, (current) => write(current, patch)))

      const modify = (f: (current: Option.Option<Profile>) => Option.Option<ProfilePatch>) =>
        lock.withPermits(1)(
          Effect.flatMap(get, (current) =>
            Option.match(f(current), {
              onNone: () => Effect.succeed(current),
              onSome: (patch) => Effect.map(write(current, patch), Option.some),
            }),
          ),
        )

      return ProfileRepo.of({ get, save, modify })
    }),
  )
}
