import { describe, expect, it } from "@effect/vitest"
import { ValidationError } from "@tanren/shared"
import { Cause, Effect, Exit, Fiber, Option, Ref, Scope } from "effect"
import { TestClock } from "effect/testing"
import { vi } from "vitest"
import {
  DatabaseInUse,
  type DatabaseLocks,
  failureMessage,
  isAccessHandleError,
  openPageStore,
} from "./runtime"
import { StoreError } from "./SqlDriver"

vi.mock("expo-crypto", () => ({ randomUUID: () => "00000000-0000-4000-8000-000000000001" }))

type Request = DatabaseLocks["request"]
type Grant = Parameters<Request>[2]

const lock: Lock = { name: "tanren.db", mode: "exclusive" }

/** Another tab holds the lock: the `ifAvailable` probe answers `null` at once. */
const busyProbe = (options: LockOptions, callback: Grant): Option.Option<Promise<void>> =>
  options.ifAvailable === true ? Option.some(callback(null)) : Option.none()

/** Another tab holds the lock: the wait never grants and rejects once its signal aborts. */
const heldElsewhere = () =>
  vi.fn<Request>((_name, options, callback) =>
    Option.getOrElse(
      busyProbe(options, callback),
      () =>
        new Promise((_resolve, reject) =>
          options.signal?.addEventListener("abort", () => reject(new Error("AbortError")), {
            once: true,
          }),
        ),
    ),
  )

/** Free lock: grants at once; the request settles when the holder's promise does (release). */
const free = () => vi.fn<Request>((_name, _options, callback) => callback(lock))

/** The signal of the waiting request (call 0 is the unsignalled probe). */
const waitSignal = (request: ReturnType<typeof heldElsewhere>) => request.mock.calls[1]?.[1].signal

/** The holder's promise from the first grant: it resolves when the lock is released. */
const heldPromise = (request: ReturnType<typeof free>): Promise<void> => {
  const result = request.mock.results[0]
  return result?.type === "return" ? result.value : Promise.reject(new Error("never granted"))
}

/**
 * Whether the promise has settled once pending microtasks drain: a real (not TestClock)
 * zero-delay macrotask runs only after every queued promise reaction.
 */
const isSettled = (promise: Promise<void>) =>
  Effect.promise(() =>
    Promise.race([
      promise.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 0)),
    ]),
  )

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
      const signal = waitSignal(request)
      expect(signal?.aborted).toBe(false)
      yield* Fiber.interrupt(fiber)
      expect(signal?.aborted).toBe(true)
      yield* Scope.close(scope, Exit.void)
    }),
  )

  it.effect("a lock granted after the wait was interrupted is released at once", () =>
    Effect.gen(function* () {
      const request = vi.fn<Request>((_name, options, callback) =>
        Option.getOrElse(busyProbe(options, callback), () => new Promise<void>(() => {})),
      )
      const scope = yield* Scope.make()
      const fiber = yield* openPageStore(Option.some({ request }), Effect.succeed("driver")).pipe(
        Scope.provide(scope),
        Effect.forkChild,
      )
      yield* TestClock.adjust("1 second")
      yield* Fiber.interrupt(fiber)
      const grant: Grant | undefined = request.mock.calls[1]?.[2]
      expect(grant).toBeDefined()
      const held = grant ? grant(lock) : Promise.resolve()
      expect(yield* isSettled(held)).toBe(true)
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
      expect(yield* isSettled(heldPromise(request))).toBe(false)
      yield* Scope.close(scope, Exit.void)
      expect(yield* isSettled(heldPromise(request))).toBe(true)
    }),
  )

  it.effect("a failed open releases the lock while the page scope stays open", () =>
    Effect.gen(function* () {
      const request = free()
      const scope = yield* Scope.make()
      const error = yield* openPageStore(Option.some({ request }), Effect.fail(permanent)).pipe(
        Scope.provide(scope),
        Effect.flip,
      )
      expect(error).toBe(permanent)
      expect(yield* isSettled(heldPromise(request))).toBe(true)
      yield* Scope.close(scope, Exit.void)
    }),
  )

  it.effect("another holder past the timeout fails with DatabaseInUse", () =>
    Effect.gen(function* () {
      const request = heldElsewhere()
      const fiber = yield* openPageStore(Option.some({ request }), Effect.succeed("driver")).pipe(
        Effect.flip,
        Effect.forkChild,
      )
      yield* TestClock.adjust("10 seconds")
      const error = yield* Fiber.join(fiber)
      expect(error).toBeInstanceOf(DatabaseInUse)
      expect(waitSignal(request)?.aborted).toBe(true)
      expect(failureMessage(Cause.fail(error))).toBe(
        "Tanren is open in another tab. Close it and reload this page.",
      )
    }),
  )

  it.effect("a lock held elsewhere signals waiting once, then opens when the holder releases", () =>
    Effect.gen(function* () {
      const waits = yield* Ref.make(0)
      const request = vi.fn<Request>((_name, options, callback) =>
        Option.getOrElse(busyProbe(options, callback), () => new Promise<void>(() => {})),
      )
      const scope = yield* Scope.make()
      const fiber = yield* openPageStore(
        Option.some({ request }),
        Effect.succeed("driver"),
        Ref.update(waits, (n) => n + 1),
      ).pipe(Scope.provide(scope), Effect.forkChild)
      yield* TestClock.adjust("3 seconds")
      expect(yield* Ref.get(waits)).toBe(1)
      expect(fiber.pollUnsafe()).toBeUndefined()
      // The other tab closes: the browser grants the waiting request.
      const grant: Grant | undefined = request.mock.calls[1]?.[2]
      const held = grant ? grant(lock) : Promise.reject(new Error("never requested"))
      expect(yield* Fiber.join(fiber)).toBe("driver")
      expect(yield* Ref.get(waits)).toBe(1)
      expect(yield* isSettled(held)).toBe(false)
      yield* Scope.close(scope, Exit.void)
      expect(yield* isSettled(held)).toBe(true)
    }),
  )

  it.effect("a lock held elsewhere past the timeout signals waiting before DatabaseInUse", () =>
    Effect.gen(function* () {
      const waits = yield* Ref.make(0)
      const fiber = yield* openPageStore(
        Option.some({ request: heldElsewhere() }),
        Effect.succeed("driver"),
        Ref.update(waits, (n) => n + 1),
      ).pipe(Effect.flip, Effect.forkChild)
      yield* TestClock.adjust("1 second")
      expect(yield* Ref.get(waits)).toBe(1)
      yield* TestClock.adjust("9 seconds")
      expect(yield* Fiber.join(fiber)).toBeInstanceOf(DatabaseInUse)
      expect(yield* Ref.get(waits)).toBe(1)
    }),
  )

  it.effect("a free lock is granted by the probe and never signals waiting", () =>
    Effect.gen(function* () {
      const waits = yield* Ref.make(0)
      const request = free()
      const driver = yield* openPageStore(
        Option.some({ request }),
        Effect.succeed("driver"),
        Ref.update(waits, (n) => n + 1),
      )
      expect(driver).toBe("driver")
      expect(yield* Ref.get(waits)).toBe(0)
      expect(request).toHaveBeenCalledTimes(1)
      expect(request.mock.calls[0]?.[1]).toEqual({ ifAvailable: true })
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
    expect(isAccessHandleError(transient)).toBe(true)
    expect(isAccessHandleError(permanent)).toBe(false)
    expect(isAccessHandleError(new StoreError({ cause: "Access Handle" }))).toBe(false)
  })
})

describe("failureMessage", () => {
  it("maps each known error tag to its copy and everything else to the generic line", () => {
    const message = (error: unknown) => failureMessage(Cause.fail(error))
    expect(message(new ValidationError({ message: "bad", issues: [] }))).toBe(
      "That set is not valid. Check weight and reps.",
    )
    expect(message(new DatabaseInUse({ lockName: "tanren.db" }))).toBe(
      "Tanren is open in another tab. Close it and reload this page.",
    )
    expect(message(new StoreError({ cause: "disk" }))).toBe(
      "Could not save on this device. Try again.",
    )
    expect(message({ _tag: "toString" })).toBe("Something went wrong.")
    expect(message({ _tag: 42 })).toBe("Something went wrong.")
    expect(message("plain")).toBe("Something went wrong.")
    expect(failureMessage(Cause.die("defect"))).toBe("Something went wrong.")
  })
})
