import { describe, expect, it } from "@effect/vitest"
import { Cause, Exit, Option } from "effect"
import { StoreError } from "../services/SqlDriver"
import { ADD_LABEL, ADDED_COPY, ALREADY_PLANNED_COPY, addOutcome, noticeCopy } from "./addToToday"

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
  it("a duplicate add reads 'Already in today's workout'", () => {
    expect(noticeCopy({ _tag: "AlreadyPlanned" })).toEqual(Option.some(ALREADY_PLANNED_COPY))
    expect(ALREADY_PLANNED_COPY).toBe("Already in today's workout")
  })

  it("the add button reads 'Add to today's workout'", () => {
    expect(ADD_LABEL).toBe("Add to today's workout")
  })

  it("a fresh add reads 'Added'", () => {
    expect(noticeCopy({ _tag: "Added" })).toEqual(Option.some(ADDED_COPY))
  })

  it("a failure has no muted line (it uses a banner)", () => {
    expect(noticeCopy({ _tag: "Failed", message: "x" })).toEqual(Option.none())
  })
})
