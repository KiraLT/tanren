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

      const save = (patch: ProfilePatch) =>
        Effect.gen(function* () {
          const userId = yield* owner
          const now = yield* DateTime.now
          const current = yield* get
          const base = Option.match(current, {
            onNone: () => ({
              id: userId,
              userId,
              createdAt: now,
              deletedAt: Option.none(),
              goals: [],
              constraints: [],
              availableDays: [],
              equipment: [],
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

      return ProfileRepo.of({ get, save })
    }),
  )
}
