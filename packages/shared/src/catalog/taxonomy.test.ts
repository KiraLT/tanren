import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { accepts, failingPaths } from "../testing"
import { CatalogId, Slug } from "./taxonomy"

describe("Slug", () => {
  it.effect("accepts kebab-case", () =>
    Effect.gen(function* () {
      yield* accepts(Slug, "barbell-back-squat")
      yield* accepts(Slug, "core-30")
    }),
  )

  it.effect("rejects spaces, capitals, edge or double dashes and more than 64 chars", () =>
    Effect.gen(function* () {
      const bad = ["Back Squat", "-plank", "plank-", "plank--hold", "a".repeat(65)]
      const paths = yield* Effect.forEach(bad, (input) => failingPaths(CatalogId, input))
      expect(paths).toEqual(bad.map(() => [[]]))
    }),
  )
})
