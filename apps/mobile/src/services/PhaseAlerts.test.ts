import { describe, expect, it } from "@effect/vitest"
import { DateTime, Effect } from "effect"
import { PhaseAlerts, PhaseAlertsLog } from "./PhaseAlerts"

const AT = DateTime.makeUnsafe("2026-10-21T07:00:40.000Z")

describe("PhaseAlerts", () => {
  it.effect("layerTest records schedule and cancelAll in order", () =>
    Effect.gen(function* () {
      const alerts = yield* PhaseAlerts
      yield* alerts.schedule(AT, "Rest over")
      yield* alerts.cancelAll
      expect(yield* (yield* PhaseAlertsLog).calls).toEqual([
        { _tag: "Schedule", at: AT, text: "Rest over" },
        { _tag: "CancelAll" },
      ])
    }).pipe(Effect.provide(PhaseAlerts.layerTest)),
  )

  it.effect("layerNoop accepts calls and does nothing", () =>
    Effect.gen(function* () {
      const alerts = yield* PhaseAlerts
      yield* alerts.schedule(AT, "x")
      yield* alerts.cancelAll
    }).pipe(Effect.provide(PhaseAlerts.layerNoop)),
  )
})
