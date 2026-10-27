import { Option } from "effect"
import { useCallback, useRef, useState } from "react"
import {
  begin,
  finish,
  type GateState,
  isBusy,
  OPEN_GATE,
  observed,
  type WriteKind,
} from "./writeGate"

export interface WriteGate {
  /** Claims a write; false means ignore the tap. Synchronous, so it holds between two taps of one tick. */
  readonly enter: (kind: WriteKind) => boolean
  /** Releases a write that was claimed; `savedVersion` is `None` for a failed save (never locks). */
  readonly settle: (kind: WriteKind, savedVersion: Option.Option<number>) => void
  /** The screen rendered this program version: a positional write waiting for it may proceed. */
  readonly observe: (version: number) => void
  /** True while a write is in flight, awaiting its render, or the screen is leaving. */
  readonly busy: boolean
}

/**
 * The transitions are `writeGate.ts` (pure, tested); the state lives in a ref so a second tap in
 * the same tick sees the first one, and in `busy` so controls re-render dimmed.
 */
export const useWriteGate = (): WriteGate => {
  const state = useRef<GateState>(OPEN_GATE)
  const [busy, setBusy] = useState(false)
  const apply = useCallback((next: GateState) => {
    // biome-ignore lint/plugin/noMutation: a ref, read synchronously by the next tap
    state.current = next
    setBusy(isBusy(next))
  }, [])
  const enter = useCallback(
    (kind: WriteKind) => {
      const next = begin(state.current, kind)
      if (Option.isNone(next)) {
        return false
      }
      apply(next.value)
      return true
    },
    [apply],
  )
  const settle = useCallback(
    (kind: WriteKind, savedVersion: Option.Option<number>) =>
      apply(finish(state.current, kind, savedVersion)),
    [apply],
  )
  const observe = useCallback(
    (version: number) => {
      const next = observed(state.current, version)
      if (next !== state.current) {
        apply(next)
      }
    },
    [apply],
  )
  return { enter, settle, observe, busy }
}
