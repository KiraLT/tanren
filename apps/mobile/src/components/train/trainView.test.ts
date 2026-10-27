import { describe, expect, it } from "@effect/vitest"
import { isTrainView, TRAIN_VIEWS, trainViewFor } from "./trainView"

describe("trainViewFor", () => {
  it("lists Plan, Programs and Library in control order", () => {
    expect(TRAIN_VIEWS.map((view) => view.label)).toEqual(["Plan", "Programs", "Library"])
  })

  it("honours every valid ?view= whatever the plan says", () => {
    const plans = ["none", "days", "loading"] as const
    const picked = TRAIN_VIEWS.flatMap(({ value }) =>
      plans.map((plan) => trainViewFor(value, plan)),
    )
    expect(picked).toEqual(TRAIN_VIEWS.flatMap(({ value }) => plans.map(() => value)))
  })

  it("defaults to Plan when the week has days or is loading, else Programs", () => {
    expect(trainViewFor(undefined, "days")).toBe("plan")
    expect(trainViewFor(undefined, "loading")).toBe("plan")
    expect(trainViewFor(undefined, "none")).toBe("programs")
  })

  it("ignores an unknown view and takes the first of a repeated one", () => {
    expect(trainViewFor("feed", "none")).toBe("programs")
    expect(trainViewFor("", "days")).toBe("plan")
    expect(trainViewFor(["library", "plan"], "days")).toBe("library")
    expect(trainViewFor([], "none")).toBe("programs")
  })

  it("narrows only the three segment names", () => {
    expect(isTrainView("programs")).toBe(true)
    expect(isTrainView("Programs")).toBe(false)
    expect(isTrainView(undefined)).toBe(false)
  })
})
