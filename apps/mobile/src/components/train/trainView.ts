/** The Train hub's segments (ADR-0029 §3), in control order; `?view=` carries one of them. */
export const TRAIN_VIEWS = [
  { value: "plan", label: "Plan" },
  { value: "programs", label: "Programs" },
  { value: "library", label: "Library" },
] as const

export type TrainView = (typeof TRAIN_VIEWS)[number]["value"]

export const isTrainView = (raw: unknown): raw is TrainView =>
  TRAIN_VIEWS.some((view) => view.value === raw)

/** What the plan read says about the week, reduced to what picks the default segment. */
export type PlanAvailability = "loading" | "days" | "none"

/**
 * The segment to show: a valid `?view=` wins; otherwise Plan while the week loads or when it has
 * days, else Programs (ADR-0029 §3). An array param (repeated `view`) uses its first value.
 */
export const trainViewFor = (
  raw: string | ReadonlyArray<string> | undefined,
  plan: PlanAvailability,
): TrainView => {
  const first = typeof raw === "string" ? raw : raw?.[0]
  if (isTrainView(first)) {
    return first
  }
  return plan === "none" ? "programs" : "plan"
}
