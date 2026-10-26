import { describe, expect, it } from "@effect/vitest"
import { Array as Arr } from "effect"
import { type SessionOverviewExercise, sessionRows } from "./sessionOverview"

/** `n` placeholder sets; `Arr.makeBy` is non-empty (0 gives one), hence the `take`. */
const sets = (n: number): ReadonlyArray<number> =>
  Arr.take(
    Arr.makeBy(Math.max(n, 1), (i) => i),
    n,
  )

const exercise = (name: string, planned: number, logged: number): SessionOverviewExercise => ({
  exercise: { name },
  plannedSets: sets(planned),
  loggedSets: sets(logged),
})

const session = [
  exercise("Back Squat", 3, 3),
  exercise("Bench Press", 3, 1),
  exercise("Row", 3, 0),
  exercise("Plank", 2, 0),
]

describe("sessionRows", () => {
  it("marks done, now and todo by logged sets and the current index", () => {
    expect(Arr.map(sessionRows(session, 1), (row) => row.state)).toEqual([
      "done",
      "now",
      "todo",
      "todo",
    ])
  })

  it("keeps done on the current exercise once all planned sets are logged", () => {
    expect(Arr.map(sessionRows(session, 0), (row) => row.state)).toEqual([
      "done",
      "todo",
      "todo",
      "todo",
    ])
  })

  it("formats the trailing text as logged/planned sets", () => {
    expect(Arr.map(sessionRows(session, 1), (row) => row.trailing)).toEqual([
      "3/3 sets",
      "1/3 sets",
      "0/3 sets",
      "0/2 sets",
    ])
  })

  it("maps rows to pager indexes with 1-based disc numbers and the exercise name", () => {
    const rows = sessionRows(session, 2)
    expect(Arr.map(rows, (row) => row.index)).toEqual([0, 1, 2, 3])
    expect(Arr.map(rows, (row) => row.number)).toEqual([1, 2, 3, 4])
    expect(Arr.map(rows, (row) => row.title)).toEqual(["Back Squat", "Bench Press", "Row", "Plank"])
  })

  it("is empty for an empty session", () => {
    expect(sessionRows([], 0)).toEqual([])
  })
})
