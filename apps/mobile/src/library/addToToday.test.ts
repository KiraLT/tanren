import { describe, expect, it } from "@effect/vitest"
import { Cause, Exit, Option } from "effect"
import { StoreError } from "../services/SqlDriver"
import { ADDED_COPY, ALREADY_PLANNED_COPY, addOutcome, noticeCopy } from "./addToToday"

const describeCause = (cause: Cause.Cause<unknown>) => (Cause.hasFails(cause) ? "store" : "defect")

describe("addOutcome", () => {
  it("added becomes Added", () => {
    expect(addOutcome(Exit.succeed("added"), describeCause)).toEqual({ _tag: "Added" })
  })

  it("alreadyPlanned becomes AlreadyPlanned", () => {
    expect(addOutcome(Exit.succeed("alreadyPlanned"), describeCause)).toEqual({
      _tag: "AlreadyPlanned",
    })
  })

  it("noSession shows the no-session notice", () => {
    expect(addOutcome(Exit.succeed("noSession"), describeCause)).toEqual({ _tag: "NoSession" })
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

describe("noticeCopy", () => {
  it("a duplicate add reads 'Already in today's session'", () => {
    expect(noticeCopy({ _tag: "AlreadyPlanned" })).toEqual(Option.some(ALREADY_PLANNED_COPY))
    expect(ALREADY_PLANNED_COPY).toBe("Already in today's session")
  })

  it("a fresh add reads 'Added'", () => {
    expect(noticeCopy({ _tag: "Added" })).toEqual(Option.some(ADDED_COPY))
  })

  it("no session and failures have no muted line (they use a banner)", () => {
    expect(noticeCopy({ _tag: "NoSession" })).toEqual(Option.none())
    expect(noticeCopy({ _tag: "Failed", message: "x" })).toEqual(Option.none())
  })
})
