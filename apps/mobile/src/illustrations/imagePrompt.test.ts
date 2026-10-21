import { readFileSync } from "node:fs"
import { join } from "node:path"
import { CATALOG, CatalogId, findCatalogExercise } from "@tanren/shared"
import { Option, Result, Schema } from "effect"
import { describe, expect, it } from "vitest"
import {
  ApiErrorBody,
  exercisePrompt,
  humanize,
  IMAGE_SHEET,
  ImagesResponse,
  imageContactSheet,
  parseImageArgs,
  parseStyleGuide,
  RUN_CAP,
  redactSecrets,
  SAMPLE_IDS,
  STYLE_FILE,
  selectIds,
} from "./imagePrompt"

const catalogIds = CATALOG.map((entry) => entry.catalogId)
const none = () => false
const args = (argv: ReadonlyArray<string>) =>
  Result.getOrThrowWith(parseImageArgs(argv), (message) => new Error(message))

describe("parseImageArgs", () => {
  it("defaults to the capped whole-catalog run", () => {
    expect(args([])).toEqual({
      samples: false,
      all: false,
      limit: Option.none(),
      only: Option.none(),
    })
  })

  it("reads every flag and ignores a pnpm `--` separator", () => {
    expect(args(["--", "--only", "plank, crunch", "--limit", "3", "--all"])).toEqual({
      samples: false,
      all: true,
      limit: Option.some(3),
      only: Option.some(["plank", "crunch"]),
    })
  })

  it("rejects unknown flags, bad limits, empty --only and --samples with --only", () => {
    expect(Result.isFailure(parseImageArgs(["--sample"]))).toBe(true)
    expect(Result.isFailure(parseImageArgs(["--limit", "0"]))).toBe(true)
    expect(Result.isFailure(parseImageArgs(["--limit"]))).toBe(true)
    expect(Result.isFailure(parseImageArgs(["--only", "--all"]))).toBe(true)
    expect(Result.isFailure(parseImageArgs(["--samples", "--only", "plank"]))).toBe(true)
  })
})

describe("selectIds", () => {
  const select = (argv: ReadonlyArray<string>, exists: (id: string) => boolean = none) =>
    selectIds(args(argv), catalogIds, exists)

  it("--samples picks the six sample ids, all of them real catalog ids", () => {
    expect(SAMPLE_IDS).toHaveLength(6)
    SAMPLE_IDS.forEach((id) => {
      expect(Option.isSome(findCatalogExercise(CatalogId.make(id)))).toBe(true)
    })
    expect(select(["--samples"])).toEqual(
      Result.succeed({ ids: SAMPLE_IDS, existing: 0, deferred: 0 }),
    )
  })

  it("skips ids whose file exists, so a second run writes nothing", () => {
    expect(select(["--samples"], () => true)).toEqual(
      Result.succeed({ ids: [], existing: 6, deferred: 0 }),
    )
  })

  it("caps a run at RUN_CAP unless --all, after --limit", () => {
    const capped = Result.getOrThrow(select([]))
    expect(capped.ids).toEqual(catalogIds.slice(0, RUN_CAP))
    expect(capped.deferred).toBe(catalogIds.length - RUN_CAP)
    expect(Result.getOrThrow(select(["--limit", "2"])).ids).toEqual(catalogIds.slice(0, 2))
    expect(Result.getOrThrow(select(["--all"])).ids).toHaveLength(catalogIds.length)
    expect(Result.getOrThrow(select(["--all", "--limit", "20"])).ids).toHaveLength(20)
  })

  it("rejects ids that are not in the catalog", () => {
    expect(select(["--only", "plank,not-an-exercise"])).toEqual(
      Result.fail("unknown catalog ids: not-an-exercise"),
    )
  })
})

describe("prompt", () => {
  const guide = Option.getOrThrow(
    parseStyleGuide(readFileSync(join(import.meta.dirname, "../..", STYLE_FILE), "utf8")),
  )

  it("reads the style and template blocks from the committed style.md", () => {
    expect(guide.style).toContain("#C2410C")
    expect(guide.template).toContain("{{name}}")
    expect(Option.isNone(parseStyleGuide("```style\nonly a style\n```"))).toBe(true)
  })

  it("fills name, equipment, two instruction lines and the primary muscle", () => {
    const prompt = exercisePrompt(guide, {
      name: "Smith Machine Squat",
      equipment: ["smithMachine"],
      instructions: ["Stand tall", "Squat down.", "Drive up"],
      primaryMuscles: ["quads", "glutes"],
    })
    expect(prompt.startsWith(guide.style)).toBe(true)
    expect(prompt).toContain("Exercise: Smith Machine Squat.")
    expect(prompt).toContain("Equipment: smith machine.")
    expect(prompt).toContain("Stand tall. Squat down.")
    expect(prompt).not.toContain("Drive up")
    expect(prompt).toContain("quads and glutes")
    expect(prompt).not.toContain("{{")
  })

  it("calls an empty equipment list bodyweight", () => {
    const plank = Option.getOrThrow(findCatalogExercise(CatalogId.make("plank")))
    expect(exercisePrompt(guide, plank)).toContain("bodyweight, no equipment")
    expect(humanize("upperBack")).toBe("upper back")
  })
})

describe("wire and output", () => {
  it("decodes the generations body and the error body", () => {
    const ok = Schema.decodeUnknownOption(ImagesResponse)({
      created: 1,
      data: [{ b64_json: "AA==" }],
    })
    expect(Option.map(ok, (body) => body.data[0]?.b64_json)).toEqual(Option.some("AA=="))
    expect(
      Option.isNone(Schema.decodeUnknownOption(ImagesResponse)({ data: [{ url: "x" }] })),
    ).toBe(true)
    expect(
      Option.isSome(Schema.decodeUnknownOption(ApiErrorBody)({ error: { message: "no" } })),
    ).toBe(true)
  })

  it("redacts anything shaped like an API key", () => {
    expect(redactSecrets("Incorrect API key provided: sk-proj-ab***yz9. See docs")).toBe(
      "Incorrect API key provided: sk-[redacted] See docs",
    )
  })

  it("lists every image with its id", () => {
    const html = imageContactSheet(["plank", "crunch"])
    expect(IMAGE_SHEET.endsWith("_contact-sheet.html")).toBe(true)
    expect(html).toContain('<img src="plank.webp"')
    expect(html).toContain("<figcaption>crunch</figcaption>")
    expect(html).toContain("(2)")
  })
})
