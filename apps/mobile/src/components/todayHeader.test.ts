import { describe, expect, it } from "@effect/vitest"
import {
  CatalogId,
  CORE30,
  LocalDate,
  type ProgramDay,
  ProgramEnrollment,
  ProgramEnrollmentId,
} from "@tanren/shared"
import { Array as Arr, DateTime, Option } from "effect"
import { LOCAL_USER_ID } from "../store/localUser"
import { illustrationIdFor, lastSetText, todayEyebrowOf } from "./todayHeader"

const at = DateTime.makeUnsafe("2026-10-21T08:00:00.000Z")
const enrollment = new ProgramEnrollment({
  id: ProgramEnrollmentId.make("00000000-0000-4000-8000-0000000000b1"),
  userId: LOCAL_USER_ID,
  createdAt: at,
  updatedAt: at,
  deletedAt: Option.none(),
  programId: CORE30.programId,
  startedOn: LocalDate.make("2026-10-20"),
  status: "active",
  currentDay: 2,
})
const ready = (day: Option.Option<ProgramDay>) =>
  ({ _tag: "Ready", program: CORE30, enrollment, day }) as const

describe("todayEyebrowOf", () => {
  it("reads 'Core 30 · Day 2 of 30' with the share of days already done", () => {
    const day2 = Arr.findFirst(CORE30.days, (day) => day.dayNumber === 2)
    expect(todayEyebrowOf(ready(day2))).toEqual(
      Option.some({ label: "Core 30 · Day 2 of 30", progress: 1 / 30 }),
    )
  })

  it("is None when not enrolled, loading, failed, or past the last day", () => {
    expect(todayEyebrowOf({ _tag: "NotEnrolled", program: CORE30 })).toEqual(Option.none())
    expect(todayEyebrowOf({ _tag: "Loading" })).toEqual(Option.none())
    expect(todayEyebrowOf({ _tag: "Failed", message: "x" })).toEqual(Option.none())
    expect(todayEyebrowOf(ready(Option.none()))).toEqual(Option.none())
  })
})

describe("illustrationIdFor", () => {
  it("prefers the exercise's own catalog link", () => {
    const own = CatalogId.make("front-squat")
    expect(illustrationIdFor({ name: "Back Squat", catalogId: Option.some(own) })).toEqual(
      Option.some(own),
    )
  })

  it("falls back to an exact name or alias match, ignoring case", () => {
    expect(illustrationIdFor({ name: "Barbell Row", catalogId: Option.none() })).toEqual(
      Option.some(CatalogId.make("barbell-row")),
    )
    expect(Option.isSome(illustrationIdFor({ name: "back squat", catalogId: Option.none() }))).toBe(
      true,
    )
  })

  it("is None for a partial or unknown name", () => {
    expect(illustrationIdFor({ name: "Squ", catalogId: Option.none() })).toEqual(Option.none())
    expect(illustrationIdFor({ name: "My own lift", catalogId: Option.none() })).toEqual(
      Option.none(),
    )
  })
})

describe("lastSetText", () => {
  it("shows the last logged set", () => {
    expect(
      lastSetText(
        [
          { weightKg: 90, reps: 5 },
          { weightKg: 100, reps: 5 },
        ],
        { weightKg: 105, reps: 3 },
      ),
    ).toBe("Last set 100 kg × 5")
  })

  it("shows the prefilled target before the first set", () => {
    expect(lastSetText([], { weightKg: 107.5, reps: 5 })).toBe("Target 107.5 kg × 5")
  })
})
