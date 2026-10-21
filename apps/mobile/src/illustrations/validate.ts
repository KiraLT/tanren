/**
 * Pure checks for `illustrations:check` (v2-catalog.md §5 as tightened by TI3/TI4): per-file SVG
 * rules, catalog coverage, staleness against an in-memory rebuild, and the whole-set budget.
 */
import { ALLOWED_ELEMENTS, MAX_BYTES, MAX_TOTAL_BYTES, PALETTE, STROKE, SVG_ROOT } from "./style"

/** I3 flips this once every catalog id is drawn; until then missing ids are printed only (TI4). */
export const STRICT_COVERAGE = false

export type Rule =
  | "root"
  | "size"
  | "element"
  | "attribute"
  | "colour"
  | "stroke-width"
  | "accent"
  | "coverage"
  | "stale"
  | "budget"

export interface Failure {
  readonly rule: Rule
  readonly subject: string
  readonly message: string
}

const failure = (rule: Rule, subject: string, message: string): Failure => ({
  rule,
  subject,
  message,
})

export const byteLength = (text: string): number => new TextEncoder().encode(text).length

const ALLOWED_COLOURS: ReadonlyArray<string> = [PALETTE.figure, PALETTE.accent, "none"]
const ALLOWED_WIDTHS: ReadonlyArray<string> = [STROKE.thin, STROKE.figure, STROKE.accent].map(
  String,
)

const matches = (text: string, pattern: RegExp): ReadonlyArray<string> =>
  Array.from(text.matchAll(pattern), (m) => m[1] ?? "")

const unique = (values: ReadonlyArray<string>) => Array.from(new Set(values))

/** Every §7 rule for one file; an empty list means the file passes. */
export const validateSvg = (id: string, svg: string): ReadonlyArray<Failure> => {
  const bytes = byteLength(svg)
  const elements = unique(matches(svg, /<([A-Za-z][\w:-]*)/g)).filter(
    (name) => !ALLOWED_ELEMENTS.includes(name),
  )
  const attributes = unique(matches(svg, /\s(style|id|on[a-z]+)\s*=/gi))
  const colours = unique(matches(svg, /\s(?:fill|stroke)="([^"]*)"/g)).filter(
    (value) => !ALLOWED_COLOURS.includes(value),
  )
  const widths = unique(matches(svg, /\sstroke-width="([^"]*)"/g)).filter(
    (value) => !ALLOWED_WIDTHS.includes(value),
  )
  const accents = matches(svg, /(stroke="#F0632A")/g).length
  return [
    ...(svg.startsWith(SVG_ROOT) && svg.endsWith("</svg>")
      ? []
      : [failure("root", id, "root element must be exactly the §7 <svg …> (viewBox 0 0 240 240)")]),
    ...(bytes <= MAX_BYTES ? [] : [failure("size", id, `${bytes} bytes > ${MAX_BYTES}`)]),
    ...elements.map((name) => failure("element", id, `element <${name}> is not allowed`)),
    ...attributes.map((name) => failure("attribute", id, `attribute ${name}= is not allowed`)),
    ...colours.map((value) => failure("colour", id, `colour ${value} is not in the palette`)),
    ...widths.map((value) => failure("stroke-width", id, `stroke-width ${value} not in 1.5/2.5/4`)),
    ...(accents === 1
      ? []
      : [failure("accent", id, `${accents} accent regions, expected exactly 1`)]),
  ]
}

export interface Coverage {
  readonly missing: ReadonlyArray<string>
  readonly extra: ReadonlyArray<string>
  readonly failures: ReadonlyArray<Failure>
}

/** Drawn ids vs catalog ids: extra always fails; missing fails only when `strict`. */
export const coverage = (
  drawn: ReadonlyArray<string>,
  catalogIds: ReadonlyArray<string>,
  strict: boolean = STRICT_COVERAGE,
): Coverage => {
  const missing = unique(catalogIds).filter((id) => !drawn.includes(id))
  const extra = unique(drawn).filter((id) => !catalogIds.includes(id))
  return {
    missing,
    extra,
    failures: [
      ...extra.map((id) => failure("coverage", id, "drawn but not in CATALOG (extra)")),
      ...(strict ? missing.map((id) => failure("coverage", id, "in CATALOG but not drawn")) : []),
    ],
  }
}

/**
 * Committed files vs an in-memory rebuild. `committed` maps every file found on disk under the
 * output folders to its content; a changed, missing or orphaned file is stale.
 */
export const staleFiles = (
  expected: ReadonlyArray<{ readonly path: string; readonly content: string }>,
  committed: ReadonlyMap<string, string>,
): ReadonlyArray<Failure> => {
  const expectedPaths = expected.map((file) => file.path)
  const changed = expected.flatMap((file) => {
    const onDisk = committed.get(file.path)
    return onDisk === undefined
      ? [failure("stale", file.path, "missing: run illustrations:build")]
      : onDisk === file.content
        ? []
        : [failure("stale", file.path, "differs from a fresh build: run illustrations:build")]
  })
  const orphans = Array.from(committed.keys())
    .filter((path) => !expectedPaths.includes(path))
    .map((path) => failure("stale", path, "no scene produces this file: delete it or rebuild"))
  return [...changed, ...orphans]
}

export const budget = (svgs: ReadonlyArray<string>): ReadonlyArray<Failure> => {
  const total = svgs.reduce((sum, svg) => sum + byteLength(svg), 0)
  return total <= MAX_TOTAL_BYTES
    ? []
    : [failure("budget", "all", `${total} bytes > ${MAX_TOTAL_BYTES}`)]
}

export interface Summary {
  readonly count: number
  readonly maxBytes: number
  readonly maxId: string
  readonly totalBytes: number
  readonly missing: number
  readonly extra: number
  readonly failures: ReadonlyArray<Failure>
}

/** Runs every check over a rebuild; the script prints the result. */
export const checkAll = (input: {
  readonly svgs: ReadonlyArray<{ readonly id: string; readonly svg: string }>
  readonly expected: ReadonlyArray<{ readonly path: string; readonly content: string }>
  readonly committed: ReadonlyMap<string, string>
  readonly catalogIds: ReadonlyArray<string>
  readonly strict?: boolean
}): Summary => {
  const sizes = input.svgs.map((s) => ({ id: s.id, bytes: byteLength(s.svg) }))
  const largest = sizes.reduce((max, s) => (s.bytes > max.bytes ? s : max), { id: "-", bytes: 0 })
  const cover = coverage(
    input.svgs.map((s) => s.id),
    input.catalogIds,
    input.strict,
  )
  return {
    count: input.svgs.length,
    maxBytes: largest.bytes,
    maxId: largest.id,
    totalBytes: sizes.reduce((sum, s) => sum + s.bytes, 0),
    missing: cover.missing.length,
    extra: cover.extra.length,
    failures: [
      ...input.svgs.flatMap((s) => validateSvg(s.id, s.svg)),
      ...cover.failures,
      ...staleFiles(input.expected, input.committed),
      ...budget(input.svgs.map((s) => s.svg)),
    ],
  }
}

export const formatSummary = (s: Summary): string =>
  `illustrations: count ${s.count}, max bytes ${s.maxBytes} (${s.maxId}), total bytes ${s.totalBytes}, missing ${s.missing}, extra ${s.extra}, failures ${s.failures.length}`
