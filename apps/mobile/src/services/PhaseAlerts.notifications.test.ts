import { describe, expect, it } from "@effect/vitest"
import { DateTime, Effect, Ref } from "effect"
import { TestClock } from "effect/testing"
import {
  type NotificationsApi,
  notificationAlerts,
  secondsUntil,
} from "./PhaseAlerts.notifications"

const NOW = Date.UTC(2026, 9, 21, 7)

type Call = "permission" | "cancel" | `schedule ${number} ${string}`

/** A fake API that records calls; `permission` and `failSchedule` steer it. */
const fake = (options: { readonly permission: boolean; readonly failSchedule?: boolean }) =>
  Effect.gen(function* () {
    const calls = yield* Ref.make<ReadonlyArray<Call>>([])
    const record = (call: Call) => Effect.runSync(Ref.update(calls, (all) => [...all, call]))
    const api: NotificationsApi = {
      requestPermission: () => {
        record("permission")
        return Promise.resolve(options.permission)
      },
      scheduleIn: (seconds, text) => {
        record(`schedule ${seconds} ${text}`)
        return options.failSchedule === true
          ? Promise.reject(new Error("native module missing"))
          : Promise.resolve("id")
      },
      cancelAll: () => {
        record("cancel")
        return Promise.resolve()
      },
    }
    return { api, calls: Ref.get(calls) }
  })

const at = (offsetMs: number) => DateTime.makeUnsafe(NOW + offsetMs)

describe("PhaseAlerts.notifications", () => {
  it("secondsUntil rounds up and is at least 1", () => {
    expect(secondsUntil(at(0), at(40_000))).toBe(40)
    expect(secondsUntil(at(0), at(40_200))).toBe(41)
    expect(secondsUntil(at(0), at(-5_000))).toBe(1)
  })

  it.effect("asks permission once, cancels the previous alert, schedules at `at`", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW)
      const { api, calls } = yield* fake({ permission: true })
      const alerts = yield* notificationAlerts(api)
      yield* alerts.schedule(at(40_000), "Rest over — Plank, 40 s")
      yield* alerts.schedule(at(15_000), "Work: Side plank")
      yield* alerts.cancelAll
      expect(yield* calls).toEqual([
        "permission",
        "cancel",
        "schedule 40 Rest over — Plank, 40 s",
        "cancel",
        "schedule 15 Work: Side plank",
        "cancel",
      ])
    }),
  )

  it.effect("denied permission makes every schedule a no-op, asked only once", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW)
      const { api, calls } = yield* fake({ permission: false })
      const alerts = yield* notificationAlerts(api)
      yield* alerts.schedule(at(40_000), "a")
      yield* alerts.schedule(at(40_000), "b")
      expect(yield* calls).toEqual(["permission"])
    }),
  )

  it.effect("a rejected schedule or permission request is logged and swallowed", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW)
      const { api, calls } = yield* fake({ permission: true, failSchedule: true })
      const alerts = yield* notificationAlerts(api)
      yield* alerts.schedule(at(10_000), "x")
      expect(yield* calls).toEqual(["permission", "cancel", "schedule 10 x"])

      const broken = yield* notificationAlerts({
        ...api,
        requestPermission: () => Promise.reject(new Error("no permission module")),
      })
      yield* broken.schedule(at(10_000), "y")
      expect((yield* calls).length).toBe(3)
    }),
  )
})
