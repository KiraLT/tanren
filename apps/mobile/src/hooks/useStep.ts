import type { CatalogEquipment } from "@tanren/shared"
import { Effect, Option, Stream } from "effect"
import { useCallback, useEffect, useState } from "react"
import { effectiveStep, stepKgFor } from "../components/stepMath"
import { runtime } from "../services/runtime"
import { type StepKey, StepRepo } from "../services/StepRepo"
import { StoreEvents } from "../services/StoreEvents"

export interface StepState {
  /** The ± weight step: the override, else the equipment default. */
  readonly stepKg: number
  readonly isOverride: boolean
  /** Picking the equipment default clears the override; any other value stores it. */
  readonly setStep: (stepKg: number) => void
  readonly reset: () => void
}

/**
 * The override of `key`, re-read on every store change; a failed read emits None (the default) and
 * the stream keeps going, so a later write is still picked up.
 */
export const overrideChanges = (key: StepKey) =>
  StoreEvents.use((events) =>
    Effect.succeed(
      Stream.mapEffect(events.changes, () =>
        StepRepo.use((repo) => repo.get(key)).pipe(
          Effect.catch(() => Effect.succeed(Option.none<number>())),
        ),
      ),
    ),
  )

/**
 * The weight step of one exercise (weight-entry.md §2): the device override from `StepRepo`, re-read
 * after every store write, else `stepKgFor(equipment)`. A failed read or write keeps the default
 * (the step is a convenience, never a blocker).
 */
export const useStep = (key: StepKey, equipment: ReadonlyArray<CatalogEquipment>): StepState => {
  const [override, setOverride] = useState<Option.Option<number>>(Option.none())

  useEffect(() => {
    // The stream emits the current store version first, so the first read runs at once.
    const cancel = runtime.runCallback(
      overrideChanges(key).pipe(
        Effect.flatMap((changes) =>
          Stream.runForEach(changes, (value) => Effect.sync(() => setOverride(value))),
        ),
      ),
      { onExit: () => undefined },
    )
    return () => {
      cancel()
    }
  }, [key])

  const defaultKg = stepKgFor(equipment)
  const write = useCallback(
    (next: Option.Option<number>) => {
      runtime.runCallback(
        StepRepo.use((repo) =>
          Option.match(next, {
            onNone: () => repo.clear(key),
            onSome: (stepKg) => repo.set(key, stepKg),
          }),
        ),
        { onExit: () => undefined },
      )
    },
    [key],
  )

  return {
    stepKg: effectiveStep(override, equipment),
    isOverride: Option.isSome(override),
    setStep: (stepKg) => write(stepKg === defaultKg ? Option.none() : Option.some(stepKg)),
    reset: () => write(Option.none()),
  }
}
