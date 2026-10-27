import { Match, Option } from "effect"
import { CARD_PADDING } from "./controls"
import { gutter, space } from "./tokens"

/** One confirmation (docs/design/confirm-dialogs.md §2). Copy rules and the inventory are §3. */
export interface ConfirmRequest {
  /** Sentence case, ≤ 2 lines at 326: "Delete this program?" */
  readonly title: string
  /** What is lost and whether it comes back, ≤ 3 lines: "Its 12 days are gone for good." */
  readonly message: string
  /** A verb, 1–2 words, ≤ 12 characters so it fits the 157 px button at 390: "Delete", "Disconnect". */
  readonly confirmLabel: string
  /**
   * The confirm button's accessible name when it must say more than the visible label; it starts
   * with the visible words (WCAG 2.5.3), so the delete-account dialog's "Delete all" needs none.
   */
  readonly confirmAccessibilityLabel?: string
  /** Defaults to "Cancel". */
  readonly cancelLabel?: string
  /** Defaults to true: the confirm button is `destructive`; false makes it `primary`. */
  readonly destructive?: boolean
}

/** Resolves `true` on confirm and `false` on cancel, dismiss or replacement; never rejects. */
export type Confirm = (request: ConfirmRequest) => Promise<boolean>

/** The open web dialog: its request and the resolver of the promise `confirm()` returned. */
export interface Pending {
  readonly request: ConfirmRequest
  readonly resolve: (confirmed: boolean) => void
}

/**
 * The web provider's state: the open request, and the replaced ones still to be resolved `false`.
 * Replacement is recorded here rather than resolved inside the reducer, which must stay pure; two
 * `confirm()` calls in one tick are batched into one render, so the first never commits on its own.
 */
export interface PendingState {
  readonly open: Option.Option<Pending>
  readonly dismissed: ReadonlyArray<Pending>
}

export const closedState: PendingState = { open: Option.none(), dismissed: [] }

export type PendingEvent =
  /** A `confirm()` call: it shows, and an open request moves to `dismissed`. */
  | { readonly _tag: "Requested"; readonly pending: Pending }
  /**
   * `pending` was answered (its promise is already resolved by the caller): close it, but only
   * while it is still the open one (a replacement that rendered in the same frame stays).
   */
  | { readonly _tag: "Resolved"; readonly pending: Pending }
  /** The provider resolved these dismissed requests `false`: forget them. */
  | { readonly _tag: "Flushed"; readonly flushed: ReadonlyArray<Pending> }

/** The web provider's reducer (§4 state matrix: Closed, Open, Replaced). */
export const stepPending = (state: PendingState, event: PendingEvent): PendingState =>
  Match.value(event).pipe(
    Match.tagsExhaustive({
      Requested: ({ pending }) => ({
        open: Option.some(pending),
        dismissed: Option.match(state.open, {
          onNone: () => state.dismissed,
          onSome: (replaced) => [...state.dismissed, replaced],
        }),
      }),
      Resolved: ({ pending }) =>
        Option.exists(state.open, (open) => open === pending)
          ? { ...state, open: Option.none() }
          : state,
      Flushed: ({ flushed }) => ({
        ...state,
        dismissed: state.dismissed.filter((pending) => !flushed.includes(pending)),
      }),
    }),
  )

export const DEFAULT_CANCEL_LABEL = "Cancel"

export interface AlertButtonSpec {
  readonly text: string
  readonly style: "cancel" | "default" | "destructive"
  /** What the promise resolves to when this button is pressed. */
  readonly value: boolean
}

/** The native `Alert.alert` buttons: cancel first (iOS left), then the confirm verb. */
export const alertButtons = (
  request: ConfirmRequest,
): readonly [AlertButtonSpec, AlertButtonSpec] => [
  { text: request.cancelLabel ?? DEFAULT_CANCEL_LABEL, style: "cancel", value: false },
  {
    text: request.confirmLabel,
    style: (request.destructive ?? true) ? "destructive" : "default",
    value: true,
  },
]

const MAX_WIDTH = 400

/** The web dialog's width: the viewport minus two phone gutters, capped at 400 (390 → 358). */
export const dialogWidth = (viewportWidth: number): number =>
  Math.min(viewportWidth - 2 * gutter.phone, MAX_WIDTH)

/** Web `ConfirmDialog` measures (§2 table): card padding 16, message gap 8, buttons 24 below, 12 apart. */
export const DIALOG = {
  padding: CARD_PADDING,
  messageGap: space.sm,
  buttonsGap: space.xl,
  buttonGap: space.md,
} as const
