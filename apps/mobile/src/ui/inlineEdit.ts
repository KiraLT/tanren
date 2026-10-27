import { Option } from "effect"
import { useRef, useState } from "react"

/**
 * Tap-to-type on a stepper value (weight-entry.md §1): one edit starts from the shown value, the
 * field's Enter, blur or native Done commits the draft, Escape cancels. Shared by `Stepper` and the
 * editor's `CompactStepper`.
 */
export interface InlineEditState {
  readonly editing: boolean
  readonly draft: string
}

export const IDLE_EDIT: InlineEditState = { editing: false, draft: "" }

/** A new edit whose draft is the value on screen. */
export const startEdit = (value: string): InlineEditState => ({ editing: true, draft: value })

/** The typed text; ignored once the edit has ended. */
export const typeDraft = (state: InlineEditState, raw: string): InlineEditState =>
  state.editing ? { ...state, draft: raw } : state

export interface InlineEditEnd {
  readonly next: InlineEditState
  /** The draft to hand to `onCommit`, None on cancel or when the edit already ended. */
  readonly commit: Option.Option<string>
}

/**
 * Ends the edit once: Enter blurs the field on web and the blur ends it again, Escape unmounts the
 * field and its blur ends it again; only the first end counts (the latch).
 */
export const endEdit = (state: InlineEditState, commit: boolean): InlineEditEnd =>
  state.editing
    ? { next: IDLE_EDIT, commit: commit ? Option.some(state.draft) : Option.none() }
    : { next: state, commit: Option.none() }

export interface InlineEdit {
  readonly editing: boolean
  readonly draft: string
  readonly start: () => void
  readonly type: (raw: string) => void
  /** Enter, blur, native Done, and a ± press before it steps. */
  readonly commit: () => void
  /** Escape. */
  readonly cancel: () => void
}

/**
 * The edit lives in a ref so a blur right after Enter (before React re-renders) sees the ended edit;
 * the state copy only drives rendering.
 */
export const useInlineEdit = (value: string, onCommit: (raw: string) => void): InlineEdit => {
  const latest = useRef(IDLE_EDIT)
  const [state, setState] = useState(IDLE_EDIT)
  const apply = (next: InlineEditState) => {
    // biome-ignore lint/plugin/noMutation: React ref holding the synchronous edit state
    latest.current = next
    setState(next)
  }
  const end = (commit: boolean) => {
    const ended = endEdit(latest.current, commit)
    apply(ended.next)
    Option.match(ended.commit, { onNone: () => undefined, onSome: onCommit })
  }
  return {
    editing: state.editing,
    draft: state.draft,
    start: () => apply(startEdit(value)),
    type: (raw) => apply(typeDraft(latest.current, raw)),
    commit: () => end(true),
    cancel: () => end(false),
  }
}
