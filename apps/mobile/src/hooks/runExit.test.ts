import { describe, expect, it } from "@effect/vitest"
import { Data, Effect, type Exit, Layer, ManagedRuntime } from "effect"
import { runFailed } from "./runExit"

class BuildFailed extends Data.TaggedError("BuildFailed")<Record<never, never>> {}

/** Runs `effect` on a fresh runtime the way the hooks do and resolves with the exit `onExit` saw. */
const exitOf = <E>(
  layer: Layer.Layer<never, E>,
  effect: Effect.Effect<void>,
  cancelAfterStart = false,
): Promise<Exit.Exit<void, E>> => {
  const runtime = ManagedRuntime.make(layer)
  return new Promise((resolve) => {
    const cancel = runtime.runCallback(effect, { onExit: resolve })
    if (cancelAfterStart) {
      cancel()
    }
  })
}

describe("runFailed", () => {
  it("reports a runtime build failure, which the program's catchCause never sees", async () => {
    const program = Effect.void.pipe(Effect.catchCause(() => Effect.void))
    const exit = await exitOf(Layer.effectDiscard(Effect.fail(new BuildFailed())), program)
    expect(runFailed(exit)).toBe(true)
  })

  it("ignores the interrupt from the hook's own cleanup", async () => {
    const exit = await exitOf(Layer.empty, Effect.never, true)
    expect(runFailed(exit)).toBe(false)
  })

  it("ignores a run that succeeded", async () => {
    const exit = await exitOf(Layer.empty, Effect.void)
    expect(runFailed(exit)).toBe(false)
  })
})
