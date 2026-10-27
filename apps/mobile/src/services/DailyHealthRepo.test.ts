import { describe, expect, it } from "@effect/vitest"
import { LocalDate, SyncChange } from "@tanren/shared"
import { Effect, Layer, Option, Schema } from "effect"
import { LOCAL_USER_ID } from "../store/localUser"
import { DailyHealthRepo } from "./DailyHealthRepo"
import { LocalStore } from "./LocalStore"
import { StoreError } from "./SqlDriver"
import { nodeSqlDriverLayer } from "./SqlDriver.testing"
import { StoreEvents } from "./StoreEvents"

const TestLayer = DailyHealthRepo.layer.pipe(
  Layer.provideMerge(
    LocalStore.layerNoDeps.pipe(
      Layer.provideMerge(Layer.mergeAll(nodeSqlDriverLayer, StoreEvents.layer)),
    ),
  ),
)

const FailingLayer = DailyHealthRepo.layer.pipe(
  Layer.provide(
    Layer.succeed(
      LocalStore,
      LocalStore.of({
        all: () => Effect.fail(new StoreError({ cause: "boom" })),
        write: () => Effect.fail(new StoreError({ cause: "boom" })),
      }),
    ),
  ),
)

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const STAMP = "2026-10-27T06:00:00.000Z"
const TODAY = LocalDate.make("2026-10-27")

const day = (
  n: number,
  date: string,
  options: { readonly updatedAt?: string; readonly deletedAt?: string; readonly steps?: number },
) => ({
  table: "dailyHealth",
  row: {
    id: uid(n),
    userId: LOCAL_USER_ID,
    createdAt: STAMP,
    updatedAt: options.updatedAt ?? STAMP,
    deletedAt: options.deletedAt ?? null,
    provider: "garmin",
    date,
    totalCalories: 1840,
    activeCalories: null,
    steps: options.steps ?? 8420,
    restingHeartRate: 52,
  },
})

const write = (wire: ReadonlyArray<unknown>) =>
  Schema.decodeUnknownEffect(Schema.Array(SyncChange))(wire).pipe(
    Effect.orDie,
    Effect.flatMap((changes) => LocalStore.use((store) => store.write(changes, { dirty: false }))),
  )

const today = (date: LocalDate) => DailyHealthRepo.use((repo) => repo.today(date))

describe("DailyHealthRepo.today", () => {
  it.effect("is Some with today's live row", () =>
    Effect.gen(function* () {
      yield* write([day(1, "2026-10-27", {})])
      const found = yield* today(TODAY)
      expect(Option.map(found, (row) => [row.id, row.steps, row.activeCalories])).toEqual(
        Option.some([uid(1), Option.some(8420), Option.none()]),
      )
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("is None when only another date has a row", () =>
    Effect.gen(function* () {
      yield* write([day(1, "2026-10-26", {})])
      expect(Option.isNone(yield* today(TODAY))).toBe(true)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("is None when today's row is soft-deleted", () =>
    Effect.gen(function* () {
      yield* write([day(1, "2026-10-27", { deletedAt: STAMP })])
      expect(Option.isNone(yield* today(TODAY))).toBe(true)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("picks the newest updatedAt when two rows share the date", () =>
    Effect.gen(function* () {
      yield* write([
        day(1, "2026-10-27", { steps: 100 }),
        day(2, "2026-10-27", { updatedAt: "2026-10-27T07:00:00.000Z", steps: 200 }),
      ])
      expect(Option.map(yield* today(TODAY), (row) => row.id)).toEqual(Option.some(uid(2)))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("fails with StoreError when the store fails", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(today(TODAY))
      expect(error._tag).toBe("StoreError")
    }).pipe(Effect.provide(FailingLayer)),
  )
})
