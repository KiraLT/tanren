import { describe, expect, it } from "@effect/vitest"
import { Option } from "effect"
import { endEdit, IDLE_EDIT, startEdit, typeDraft } from "./inlineEdit"

describe("inline edit (tap-to-type latch)", () => {
  it("starts with the shown value as the draft", () => {
    expect(startEdit("45")).toEqual({ editing: true, draft: "45" })
  })

  it("commits the typed draft once", () => {
    const ended = endEdit(typeDraft(startEdit("30"), "45"), true)
    expect(ended.commit).toEqual(Option.some("45"))
    expect(ended.next.editing).toBe(false)
  })

  it("Escape ends the edit without a commit, and the unmount blur after it commits nothing", () => {
    const escaped = endEdit(typeDraft(startEdit("10"), "7"), false)
    expect(escaped.commit).toEqual(Option.none())
    expect(endEdit(escaped.next, true).commit).toEqual(Option.none())
  })

  it("a blur after Enter does not commit a second time", () => {
    const entered = endEdit(typeDraft(startEdit("3"), "20"), true)
    expect(entered.commit).toEqual(Option.some("20"))
    expect(endEdit(entered.next, true).commit).toEqual(Option.none())
  })

  it("typing outside an edit is ignored", () => {
    expect(typeDraft(IDLE_EDIT, "9")).toBe(IDLE_EDIT)
  })
})
