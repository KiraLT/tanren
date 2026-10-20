import { describe, expect, it } from "@effect/vitest"
import { DateTime, Effect, Fiber, Ref } from "effect"
import { TestClock } from "effect/testing"
import { type NotificationsApi, notificationAlerts } from "./PhaseAlerts.notifications"

const NOW = Date.UTC(2026, 9, 21, 7)
const at = (ms: number) => DateTime.makeUnsafe(NOW + ms)

/** Fake API with an optionally slow permission prompt; records calls and the pending count. */
const fake = (permissionDelay: Promise<void> = Promise.resolve()) =>
  Effect.gen(function* () {
    const calls = yield* Ref.make<ReadonlyArray<string>>([])
    const pending = yield* Ref.make(0)
    const rec = (s: string) => Effect.runSync(Ref.update(calls, (all) => [...all, s]))
    const api: NotificationsApi = {
      requestPermission: async () => {
        rec("permission")
        await permissionDelay
        return true
      },
      scheduleIn: async (seconds, text) => {
        Effect.runSync(Ref.update(pending, (n) => n + 1))
        rec(`schedule ${seconds} ${text}`)
      },
      cancelAll: async () => {
        Effect.runSync(Ref.set(pending, 0))
        rec("cancel")
      },
    }
    return { api, calls: Ref.get(calls), pending: Ref.get(pending) }
  })

describe("PhaseAlerts edge cases", () => {
  it.effect("many concurrent schedules (rapid pause/resume) leave at most one pending alert", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW)
      const { api, pending } = yield* fake()
      const alerts = yield* notificationAlerts(api)
      yield* Effect.all(
        Array.from({ length: 6 }, (_, i) => alerts.schedule(at(10_000 + i), `p${i}`)),
        { concurrency: "unbounded" },
      )
      expect(yield* pending).toBe(1)
    }),
  )

  it.effect("concurrent first schedules ask for permission once", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW)
      const { api, calls } = yield* fake()
      const alerts = yield* notificationAlerts(api)
      yield* Effect.all([alerts.schedule(at(5000), "a"), alerts.schedule(at(6000), "b")], {
        concurrency: "unbounded",
      })
      expect((yield* calls).filter((c) => c === "permission")).toHaveLength(1)
    }),
  )

  it.effect(
    "pausing the app (cancelAll) while a schedule waits on the permission prompt leaves nothing pending",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW)
        const { api, pending } = yield* fake()
        const alerts = yield* notificationAlerts(api)
        const scheduling = yield* Effect.forkChild(alerts.schedule(at(5000), "a"))
        yield* Effect.yieldNow
        yield* alerts.cancelAll
        yield* Fiber.join(scheduling)
        // The schedule took the lock first; a cancelAll requested after it must win.
        expect(yield* pending).toBe(0)
      }),
  )

  it.effect("an alert in the past or at now is scheduled for 1 s, never 0 or negative", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW)
      const { api, calls } = yield* fake()
      const alerts = yield* notificationAlerts(api)
      yield* alerts.schedule(at(-60_000), "late")
      yield* alerts.schedule(at(0), "now")
      expect(yield* calls).toContain("schedule 1 late")
      expect(yield* calls).toContain("schedule 1 now")
    }),
  )

  it.effect("cancelAll before any schedule never asks for permission", () =>
    Effect.gen(function* () {
      const { api, calls } = yield* fake()
      const alerts = yield* notificationAlerts(api)
      yield* alerts.cancelAll
      expect(yield* calls).toEqual(["cancel"])
    }),
  )
})
