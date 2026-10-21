import { describe, expect, it } from "@effect/vitest"
import { IdGenerator, LocationId } from "@tanren/shared"
import { DateTime, Effect, Layer, Option } from "effect"
import { CurrentUser } from "../../services/CurrentUser"
import { LocalStore } from "../../services/LocalStore"
import { ProfileRepo } from "../../services/ProfileRepo"
import { nodeSqlDriverLayer } from "../../services/SqlDriver.testing"
import { StoreEvents } from "../../services/StoreEvents"
import {
  addPresetLocation,
  applyLocations,
  emptyLocations,
  type LocationsAction,
  type LocationsState,
  lookupLocation,
  MAX_LOCATIONS,
  reduceLocations,
} from "./locationsState"

const id = (n: number) => LocationId.make(`00000000-0000-4000-8000-${String(n).padStart(12, "0")}`)
const run = (actions: ReadonlyArray<LocationsAction>, from: LocationsState = emptyLocations) =>
  actions.reduce(reduceLocations, from)

const gymAndHome = run([
  { _tag: "AddPreset", preset: "commercialGym", id: id(1) },
  { _tag: "AddPreset", preset: "home", id: id(2) },
])

describe("reduceLocations", () => {
  it("AddPreset appends the preset's name and equipment; the first one becomes active", () => {
    expect(gymAndHome.locations.map((l) => l.name)).toEqual(["Gym", "Home"])
    expect(gymAndHome.locations[1]?.equipment).toEqual([
      "dumbbell",
      "kettlebell",
      "bench",
      "pullUpBar",
      "band",
    ])
    expect(gymAndHome.activeLocationId).toEqual(Option.some(id(1)))
  })

  it("AddPreset numbers a second location from the same preset", () => {
    const twice = run([{ _tag: "AddPreset", preset: "home", id: id(3) }], gymAndHome)
    expect(twice.locations.map((l) => l.name)).toEqual(["Gym", "Home", "Home 2"])
  })

  it("AddPreset stops at the maximum number of locations", () => {
    const full = run(
      Array.from({ length: MAX_LOCATIONS + 1 }, (_, n) => ({
        _tag: "AddPreset" as const,
        preset: "bodyweightOnly" as const,
        id: id(n + 1),
      })),
    )
    expect(full.locations.length).toBe(MAX_LOCATIONS)
  })

  it("Rename trims the name and ignores a blank one", () => {
    const renamed = run([{ _tag: "Rename", id: id(2), name: "  Garage  " }], gymAndHome)
    expect(renamed.locations[1]?.name).toBe("Garage")
    expect(run([{ _tag: "Rename", id: id(2), name: "   " }], gymAndHome)).toEqual(gymAndHome)
  })

  it("Toggle removes present equipment and adds missing equipment", () => {
    const toggled = run(
      [
        { _tag: "Toggle", id: id(2), equipment: "bench" },
        { _tag: "Toggle", id: id(2), equipment: "legPress" },
      ],
      gymAndHome,
    )
    expect(toggled.locations[1]?.equipment).toEqual([
      "dumbbell",
      "kettlebell",
      "pullUpBar",
      "band",
      "legPress",
    ])
  })

  it("Remove of the active location promotes the first remaining one", () => {
    const removed = run([{ _tag: "Remove", id: id(1) }], gymAndHome)
    expect(removed.locations.map((l) => l.name)).toEqual(["Home"])
    expect(removed.activeLocationId).toEqual(Option.some(id(2)))
  })

  it("Remove of the last location clears the active id", () => {
    const removed = run(
      [
        { _tag: "Remove", id: id(1) },
        { _tag: "Remove", id: id(2) },
      ],
      gymAndHome,
    )
    expect(removed).toEqual(emptyLocations)
  })

  it("Remove of another location keeps the active id", () => {
    const removed = run([{ _tag: "Remove", id: id(2) }], gymAndHome)
    expect(removed.activeLocationId).toEqual(Option.some(id(1)))
  })

  it("SetActive picks a known location and ignores an unknown id", () => {
    expect(run([{ _tag: "SetActive", id: id(2) }], gymAndHome).activeLocationId).toEqual(
      Option.some(id(2)),
    )
    expect(run([{ _tag: "SetActive", id: id(9) }], gymAndHome)).toEqual(gymAndHome)
  })
})

const RepoLayer = Layer.mergeAll(
  ProfileRepo.layer.pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        LocalStore.layerNoDeps.pipe(
          Layer.provideMerge(Layer.mergeAll(nodeSqlDriverLayer, StoreEvents.layer)),
        ),
        CurrentUser.layerTest(Option.none()),
        DateTime.layerCurrentZoneNamed("Europe/Vilnius").pipe(Layer.orDie),
      ),
    ),
  ),
  IdGenerator.layerTest,
)

/**
 * The node driver is synchronous, so two fibers never interleave between read and save. This store
 * yields before every read, which lets a second fiber read the same profile: the lost-update race.
 */
const YieldingReadsLayer = Layer.mergeAll(
  ProfileRepo.layer.pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        Layer.effect(
          LocalStore,
          Effect.gen(function* () {
            const inner = yield* LocalStore
            return LocalStore.of({
              ...inner,
              all: (statement) => Effect.andThen(Effect.yieldNow, inner.all(statement)),
            })
          }),
        ).pipe(
          Layer.provide(
            LocalStore.layerNoDeps.pipe(
              Layer.provide(Layer.mergeAll(nodeSqlDriverLayer, StoreEvents.layer)),
            ),
          ),
        ),
        CurrentUser.layerTest(Option.none()),
        DateTime.layerCurrentZoneNamed("Europe/Vilnius").pipe(Layer.orDie),
      ),
    ),
  ),
  IdGenerator.layerTest,
)

const dirtyRows = LocalStore.use((store) =>
  store.all({ sql: `SELECT "_dirty" FROM "profile"`, params: [] }),
)

describe("applyLocations", () => {
  it.effect("the first added location is saved as the active one", () =>
    Effect.gen(function* () {
      const added = yield* addPresetLocation("home")
      const profile = yield* ProfileRepo.use((repo) => repo.get)
      expect(Option.map(profile, (p) => p.activeLocationId)).toEqual(
        Option.some(Option.some(added)),
      )
      expect(Option.map(profile, (p) => p.locations.map((l) => l.name))).toEqual(
        Option.some(["Home"]),
      )
    }).pipe(Effect.provide(RepoLayer)),
  )

  it.effect("removing the active location saves the next one as active", () =>
    Effect.gen(function* () {
      const gym = yield* addPresetLocation("commercialGym")
      const home = yield* addPresetLocation("home")
      const next = yield* applyLocations({ _tag: "Remove", id: gym })
      expect(next.activeLocationId).toEqual(Option.some(home))
      const profile = yield* ProfileRepo.use((repo) => repo.get)
      expect(Option.map(profile, (p) => p.activeLocationId)).toEqual(Option.some(Option.some(home)))
    }).pipe(Effect.provide(RepoLayer)),
  )

  it.effect("a save marks the profile row dirty", () =>
    Effect.gen(function* () {
      yield* addPresetLocation("bodyweightOnly")
      expect(yield* dirtyRows).toEqual([{ _dirty: 1 }])
    }).pipe(Effect.provide(RepoLayer)),
  )

  it.effect("a no-op action writes nothing", () =>
    Effect.gen(function* () {
      yield* applyLocations({ _tag: "SetActive", id: id(9) })
      yield* applyLocations({ _tag: "Remove", id: id(9) })
      yield* applyLocations({ _tag: "Toggle", id: id(9), equipment: "bench" })
      expect(yield* dirtyRows).toEqual([])
    }).pipe(Effect.provide(RepoLayer)),
  )

  it.effect("renaming to the same name or removing an unknown id writes nothing", () =>
    Effect.gen(function* () {
      const home = yield* addPresetLocation("home")
      // Mark the row synced, so a stray save would flip `_dirty` back to 1.
      const saved = yield* ProfileRepo.use((repo) => repo.get)
      yield* LocalStore.use((store) =>
        store.write(
          Option.match(saved, {
            onNone: () => [],
            onSome: (row) => [{ table: "profile" as const, row }],
          }),
          { dirty: false },
        ),
      )
      yield* applyLocations({ _tag: "Rename", id: home, name: " Home " })
      yield* applyLocations({ _tag: "Remove", id: id(9) })
      expect(yield* dirtyRows).toEqual([{ _dirty: 0 }])
    }).pipe(Effect.provide(RepoLayer)),
  )

  it.effect("two concurrent toggles both land", () =>
    Effect.gen(function* () {
      const home = yield* addPresetLocation("home")
      yield* Effect.all(
        [
          applyLocations({ _tag: "Toggle", id: home, equipment: "legPress" }),
          applyLocations({ _tag: "Toggle", id: home, equipment: "cable" }),
        ],
        { concurrency: "unbounded" },
      )
      const profile = yield* ProfileRepo.use((repo) => repo.get)
      const equipment = Option.map(profile, (p) => p.locations[0]?.equipment ?? [])
      expect(Option.map(equipment, (tags) => tags.includes("legPress"))).toEqual(Option.some(true))
      expect(Option.map(equipment, (tags) => tags.includes("cable"))).toEqual(Option.some(true))
    }).pipe(Effect.provide(YieldingReadsLayer)),
  )
})

describe("lookupLocation", () => {
  const loaded = { _tag: "Loaded" as const, profile: Option.some(gymAndHome) }

  it("is Loading while the profile loads", () => {
    expect(lookupLocation({ _tag: "Loading" }, id(1))._tag).toBe("Loading")
  })

  it("finds a known id and says whether it is active", () => {
    expect(lookupLocation(loaded, id(2))).toMatchObject({ _tag: "Found", active: false })
    expect(lookupLocation(loaded, id(1))).toMatchObject({ _tag: "Found", active: true })
  })

  it("is NotFound for an unknown id, a repeated param or no profile", () => {
    expect(lookupLocation(loaded, id(9))._tag).toBe("NotFound")
    expect(lookupLocation(loaded, [id(1), id(2)])._tag).toBe("NotFound")
    expect(lookupLocation({ _tag: "Loaded", profile: Option.none() }, id(1))._tag).toBe("NotFound")
  })
})

describe("reduceLocations no-ops", () => {
  it("returns the same state for an unknown id or an unchanged name", () => {
    const unknown = id(9)
    expect(reduceLocations(gymAndHome, { _tag: "Rename", id: id(2), name: "Home" })).toBe(
      gymAndHome,
    )
    expect(reduceLocations(gymAndHome, { _tag: "Rename", id: unknown, name: "X" })).toBe(gymAndHome)
    expect(reduceLocations(gymAndHome, { _tag: "Toggle", id: unknown, equipment: "bench" })).toBe(
      gymAndHome,
    )
    expect(reduceLocations(gymAndHome, { _tag: "Remove", id: unknown })).toBe(gymAndHome)
  })
})
