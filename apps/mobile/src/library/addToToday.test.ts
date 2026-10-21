import { describe, expect, it } from "@effect/vitest"
import { Cause, Exit } from "effect"
import { StoreError } from "../services/SqlDriver"
import { addOutcome } from "./addToToday"

const describeCause = (cause: Cause.Cause<unknown>) => (Cause.hasFails(cause) ? "store" : "defect")

describe("addOutcome", () => {
  it("true opens Today", () => {
    expect(addOutcome(Exit.succeed(true), describeCause)).toEqual({ _tag: "Added" })
  })

  it("false shows the no-session notice", () => {
    expect(addOutcome(Exit.succeed(false), describeCause)).toEqual({ _tag: "NoSession" })
  })

  it("a failure or defect carries the described copy", () => {
    expect(addOutcome(Exit.fail(new StoreError({ cause: "boom" })), describeCause)).toEqual({
      _tag: "Failed",
      message: "store",
    })
    expect(addOutcome(Exit.die("bug"), describeCause)).toEqual({
      _tag: "Failed",
      message: "defect",
    })
  })
})
