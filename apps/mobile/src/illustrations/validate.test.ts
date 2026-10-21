import { describe, expect, it } from "@effect/vitest"
import { SVG_ROOT as ROOT } from "./style"
import { checkAll, coverage, formatSummary, staleFiles, validateSvg } from "./validate"

const ACCENT =
  '<path d="M0 0L1 1Z" stroke="#F0632A" stroke-width="4" fill="#F0632A" fill-opacity="0.18"/>'
const svg = (body: string, root = ROOT) =>
  `${root}<g stroke="#71717A" stroke-width="2.5">${body}</g>${ACCENT}</svg>`

const rules = (input: string) => validateSvg("fixture", input).map((f) => f.rule)

describe("validateSvg", () => {
  it("accepts a file that follows every rule", () => {
    expect(validateSvg("fixture", svg('<circle cx="1" cy="1" r="14"/>'))).toEqual([])
  })

  it("rejects a wrong viewBox (root)", () => {
    expect(rules(svg("", ROOT.replace("0 0 240 240", "0 0 24 24")))).toEqual(["root"])
  })

  it("rejects a <text> element (element)", () => {
    expect(rules(svg("<text>x</text>"))).toEqual(["element"])
  })

  it("rejects a style= attribute (attribute)", () => {
    expect(rules(svg('<circle style="x" cx="1" cy="1" r="2"/>'))).toEqual(["attribute"])
  })

  it("rejects an off-palette colour (colour)", () => {
    expect(rules(svg('<circle stroke="#000000" cx="1" cy="1" r="2"/>'))).toEqual(["colour"])
  })

  it("rejects stroke-width 3 (stroke-width)", () => {
    expect(rules(svg('<line x1="0" y1="0" x2="1" y2="1" stroke-width="3"/>'))).toEqual([
      "stroke-width",
    ])
  })

  it("rejects a file over 6144 bytes (size)", () => {
    const big = Array.from({ length: 200 }, () => '<circle cx="100" cy="100" r="14"/>').join("")
    expect(rules(svg(big))).toEqual(["size"])
  })

  it("rejects id= and on*= attributes and a second accent region", () => {
    expect(rules(svg(`<circle id="a" onclick="x" cx="1" cy="1" r="2"/>${ACCENT}`))).toEqual([
      "attribute",
      "attribute",
      "accent",
    ])
  })
})

describe("coverage", () => {
  it("fails on an extra id (drawn, not in the catalog)", () => {
    const result = coverage(["plank", "ghost"], ["plank"], false)
    expect(result.extra).toEqual(["ghost"])
    expect(result.failures.map((f) => [f.rule, f.subject])).toEqual([["coverage", "ghost"]])
  })

  it("prints missing ids without failing unless strict", () => {
    expect(coverage(["plank"], ["plank", "pull-up"], false)).toMatchObject({
      missing: ["pull-up"],
      failures: [],
    })
    expect(coverage(["plank"], ["plank", "pull-up"], true).failures).toHaveLength(1)
  })
})

describe("staleFiles", () => {
  const expected = [{ path: "assets/exercises/plank.svg", content: "<svg/>" }]

  it("passes when the committed files equal a fresh build", () => {
    expect(staleFiles(expected, new Map([["assets/exercises/plank.svg", "<svg/>"]]))).toEqual([])
  })

  it("flags a changed, a missing and an orphaned file", () => {
    const changed = staleFiles(expected, new Map([["assets/exercises/plank.svg", "<svg />"]]))
    expect(changed.map((f) => f.subject)).toEqual(["assets/exercises/plank.svg"])
    expect(staleFiles(expected, new Map())).toHaveLength(1)
    const orphan = staleFiles(
      expected,
      new Map([
        ["assets/exercises/plank.svg", "<svg/>"],
        ["assets/exercises/old.svg", "<svg/>"],
      ]),
    )
    expect(orphan.map((f) => [f.rule, f.subject])).toEqual([["stale", "assets/exercises/old.svg"]])
  })
})

describe("checkAll", () => {
  it("summarises count, max bytes, missing, extra and failures", () => {
    const file = svg("")
    const summary = checkAll({
      svgs: [{ id: "plank", svg: file }],
      expected: [{ path: "assets/exercises/plank.svg", content: file }],
      committed: new Map([["assets/exercises/plank.svg", file]]),
      catalogIds: ["plank", "pull-up"],
      strict: false,
    })
    expect(formatSummary(summary)).toBe(
      `illustrations: count 1, max bytes ${file.length} (plank), total bytes ${file.length}, missing 1, extra 0, failures 0`,
    )
  })
})
