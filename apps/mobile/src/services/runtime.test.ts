import { describe, expect, it } from "@effect/vitest"
import { Cause, Effect, Exit, Fiber, Option, Ref, Scope } from "effect"
import { TestClock } from "effect/testing"
import { vi } from "vitest"
import {
  type DatabaseLocks,
  failureMessage,
  isTransientOpenFailure,
  openPageStore,
  StoreLockedError,
} from "./runtime"
import { StoreError } from "./SqlDriver"

vi.mock("expo-crypto", () => ({ randomUUID: () => "00000000-0000-4000-8000-000000000001" }))

type Request = DatabaseLocks["request"]

/** Another tab holds the lock: the request never grants and rejects once its signal aborts. */
const heldElsewhere = () =>
  vi.fn<Request>(
    (_name, options) =>
      new Promise((_resolve, reject) =>
        options.signal?.addEventListener("abort", () => reject(new Error("AbortError")), {
          once: true,
        }),
      ),
  )

/** Free lock: grants at once; the request settles when the holder's promise does (release). */
const free = () => vi.fn<Request>((_name, _options, callback) => callback(null))

const transient = new StoreError({
  cause: new Error("Access Handles cannot be created if there is another open Access Handle"),
})
const permanent = new StoreError({ cause: new Error("disk I/O error") })

/** An open that fails with each given error in turn, then succeeds; counts its attempts. */
const scriptedOpen = (failures: ReadonlyArray<StoreError>) =>
  Effect.map(Ref.make(0), (attempts) => ({
    attempts,
    open: Ref.getAndUpdate(attempts, (n) => n + 1).pipe(
      Effect.flatMap((n) =>
        Option.match(Option.fromNullishOr(failures[n]), {
          onNone: () => Effect.succeed("driver"),
          onSome: Effect.fail,
        }),
      ),
    ),
  }))

describe("openPageStore", () => {
  it.effect("interrupting the lock wait aborts the pending request", () =>
    Effect.gen(function* () {
      const request = heldElsewhere()
      const scope = yield* Scope.make()
      const fiber = yield* openPageStore(Option.some({ request }), Effect.succeed("driver")).pipe(
        Scope.provide(scope),
        Effect.forkChild,
      )
      yield* TestClock.adjust("1 second")
      const signal = request.mock.calls[0]?.[1].signal
      expect(signal?.aborted).toBe(false)
      yield* Fiber.interrupt(fiber)
      expect(signal?.aborted).toBe(true)
      yield* Scope.close(scope, Exit.void)
    }),
  )

  it.effect("closing the scope releases a granted lock", () =>
    Effect.gen(function* () {
      const request = free()
      const scope = yield* Scope.make()
      const driver = yield* openPageStore(Option.some({ request }), Effect.succeed("driver")).pipe(
        Scope.provide(scope),
      )
      expect(driver).toBe("driver")
      const held = request.mock.results[0]
      const released = held?.type === "return" ? held.value : Promise.reject(new Error("no call"))
      const settled = yield* Ref.make(false)
      yield* Effect.forkChild(
        Effect.promise(() => released).pipe(Effect.andThen(Ref.set(settled, true))),
      )
      yield* Effect.yieldNow
      expect(yield* Ref.get(settled)).toBe(false)
      yield* Scope.close(scope, Exit.void)
      yield* Effect.promise(() => released)
      expect(yield* Ref.get(settled)).toBe(true)
    }),
  )

  it.effect("another holder past the timeout fails with StoreLockedError", () =>
    Effect.gen(function* () {
      const request = heldElsewhere()
      const fiber = yield* openPageStore(Option.some({ request }), Effect.succeed("driver")).pipe(
        Effect.flip,
        Effect.forkChild,
      )
      yield* TestClock.adjust("10 seconds")
      const error = yield* Fiber.join(fiber)
      expect(error).toBeInstanceOf(StoreLockedError)
      expect(request.mock.calls[0]?.[1].signal?.aborted).toBe(true)
      expect(failureMessage(Cause.fail(error))).toBe(
        "Tanren is open in another tab. Close it and reload this page.",
      )
    }),
  )

  it.effect("a non-transient open failure is not retried", () =>
    Effect.gen(function* () {
      const { attempts, open } = yield* scriptedOpen([permanent, permanent])
      const error = yield* Effect.flip(openPageStore(Option.some({ request: free() }), open))
      expect(error).toBe(permanent)
      expect(yield* Ref.get(attempts)).toBe(1)
    }),
  )

  it.effect("the bfcache handle failure is retried and then opens", () =>
    Effect.gen(function* () {
      const { attempts, open } = yield* scriptedOpen([transient])
      const fiber = yield* Effect.forkChild(openPageStore(Option.some({ request: free() }), open))
      yield* TestClock.adjust("250 millis")
      expect(yield* Fiber.join(fiber)).toBe("driver")
      expect(yield* Ref.get(attempts)).toBe(2)
    }),
  )

  it.effect("native (no Web Locks) opens without a lock", () =>
    Effect.gen(function* () {
      expect(yield* openPageStore(Option.none(), Effect.succeed("driver"))).toBe("driver")
    }),
  )

  it("classifies only the access-handle failure as transient", () => {
    expect(isTransientOpenFailure(transient)).toBe(true)
    expect(isTransientOpenFailure(permanent)).toBe(false)
    expect(isTransientOpenFailure(new StoreError({ cause: "Access Handle" }))).toBe(false)
  })
})
