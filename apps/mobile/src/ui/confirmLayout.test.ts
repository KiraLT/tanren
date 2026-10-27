import { Option } from "effect"
import { describe, expect, it } from "vitest"
import {
  alertButtons,
  type ConfirmRequest,
  closedState,
  DIALOG,
  dialogWidth,
  type Pending,
  type PendingState,
  stepPending,
} from "./confirmLayout"

const request: ConfirmRequest = {
  title: "Delete this program?",
  message: "Its 12 days are gone for good.",
  confirmLabel: "Delete",
}

const pendingOf = (title: string): Pending => ({
  request: { ...request, title },
  resolve: () => undefined,
})

describe("alertButtons", () => {
  it("puts cancel first with the default label and a destructive confirm", () => {
    expect(alertButtons(request)).toEqual([
      { text: "Cancel", style: "cancel", value: false },
      { text: "Delete", style: "destructive", value: true },
    ])
  })

  it("uses the given cancel label and a default-style confirm when not destructive", () => {
    expect(
      alertButtons({
        ...request,
        cancelLabel: "Keep",
        confirmLabel: "Sign out",
        destructive: false,
      }),
    ).toEqual([
      { text: "Keep", style: "cancel", value: false },
      { text: "Sign out", style: "default", value: true },
    ])
  })
})

describe("stepPending", () => {
  it("opens on a request from closed and dismisses nothing", () => {
    const first = pendingOf("A")
    const next = stepPending(closedState, { _tag: "Requested", pending: first })
    expect(Option.getOrUndefined(next.open)).toBe(first)
    expect(next.dismissed).toEqual([])
  })

  it("shows a second request and queues the first to be resolved false", () => {
    const first = pendingOf("A")
    const second = pendingOf("B")
    const open = stepPending(closedState, { _tag: "Requested", pending: first })
    const next = stepPending(open, { _tag: "Requested", pending: second })
    expect(Option.getOrUndefined(next.open)).toBe(second)
    expect(next.dismissed).toEqual([first])
  })

  it("keeps every replaced request when three arrive in one tick", () => {
    const [a, b, c] = [pendingOf("A"), pendingOf("B"), pendingOf("C")]
    const next = [a, b, c].reduce(
      (state, pending) => stepPending(state, { _tag: "Requested", pending }),
      closedState,
    )
    expect(Option.getOrUndefined(next.open)).toBe(c)
    expect(next.dismissed).toEqual([a, b])
  })

  it("closes on resolve and keeps the dismissed queue", () => {
    const first = pendingOf("A")
    const state: PendingState = { open: Option.some(pendingOf("B")), dismissed: [first] }
    expect(stepPending(state, { _tag: "Resolved" })).toEqual({
      open: Option.none(),
      dismissed: [first],
    })
  })

  it("forgets only the flushed requests", () => {
    const [a, b] = [pendingOf("A"), pendingOf("B")]
    const state: PendingState = { open: Option.none(), dismissed: [a, b] }
    expect(stepPending(state, { _tag: "Flushed", flushed: [a] }).dismissed).toEqual([b])
  })
})

describe("dialogWidth", () => {
  it("is the viewport minus two phone gutters, capped at 400", () => {
    expect(dialogWidth(390)).toBe(358)
    expect(dialogWidth(1280)).toBe(400)
    expect(dialogWidth(320)).toBe(288)
    expect(DIALOG.maxWidth).toBe(400)
  })

  it("leaves two 156 px buttons at 390 and two 177 px at 1280 inside the bordered card", () => {
    expect(DIALOG.buttonWidth(390)).toBe(156)
    expect(DIALOG.buttonWidth(1280)).toBe(177)
  })
})
