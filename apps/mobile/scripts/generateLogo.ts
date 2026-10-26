/**
 * `node --env-file-if-exists=.env.images scripts/generateLogo.ts [--out <dir>] [--transparent] [--only A1,C2]`
 * (LOGO-1b; `pnpm logo:generate`): eight strictly minimal app-icon candidates (M1 to M8) from
 * OpenAI `gpt-image-1.5` (`POST /v1/images/generations`, plain fetch, 1024x1024 png, medium; `gpt-image-1`
 * is refused for this account) written to `<out>/<id>.png` (default `assets/brand/candidates`,
 * git-ignored). Existing files are skipped, so a re-run retries only failures.
 * Cost: about $0.04 per medium image, eight = about $0.35 (the run is capped at the eight ids).
 * `--sheet` writes the two contact sheets (`docs/design/screens/LOGO-1b-sheet.png` and
 * `LOGO-1b-sheet-small.png`, 60 and 29 px renders on paper and graphite) with sharp; needs no key.
 *
 * The key comes from `node --env-file-if-exists=.env.images`; this script never prints it, and API
 * error text goes through `redactSecrets`.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { registerHooks } from "node:module"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { Console, Data, Effect, Option, Result, Schedule, Schema } from "effect"
import sharp from "sharp"

const here = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const flag = (name: string) => argv.includes(name)
const argValue = (name: string) => Option.fromNullishOr(argv[argv.indexOf(name) + 1])
const outDir = resolve(
  Option.getOrElse(flag("--out") ? argValue("--out") : Option.none(), () =>
    join(here, "..", "assets", "brand", "candidates"),
  ),
)
const sheetDir = join(here, "..", "..", "..", "docs", "design", "screens")

const BASE =
  "ultra-minimal flat vector app icon, geometric, a single solid colour on a solid background plus at most one small accent, NO gradient, NO glow, NO bevel, NO texture, NO outline, NO shadow, NO text, at most two shapes, generous margin, centred, crisp edges, 2D"
const GRAPHITE = "solid graphite background (#16181D)"
const PAPER = "solid warm paper background (#F6F4EF)"
const OFF_WHITE = "off-white (#F6F4EF)"
const AMBER = "amber (#F59E0B)"

/** The round's contact-sheet prefix and image ids (LOGO-1b: strictly minimal, ids M1 to M8). */
const SHEET_PREFIX = "LOGO-1b"

type Candidate = { readonly id: string; readonly prompt: string }
const CANDIDATES: ReadonlyArray<Candidate> = [
  {
    id: "M1",
    prompt: `${BASE}. ${GRAPHITE}. A barbell reduced to three rectangles: one long thin horizontal bar and two tall plates, all one ${OFF_WHITE} colour.`,
  },
  {
    id: "M2",
    prompt: `${BASE}. ${PAPER}. A barbell reduced to three rectangles: one long thin horizontal bar and two tall plates, all in graphite (#16181D).`,
  },
  {
    id: "M3",
    prompt: `${BASE}. ${GRAPHITE}. A single thick horizontal bar in ${OFF_WHITE} with a small ${AMBER} square sitting on its centre.`,
  },
  {
    id: "M4",
    prompt: `${BASE}. ${GRAPHITE}. An anvil reduced to a single flat trapezoid in ${OFF_WHITE}, nothing else.`,
  },
  {
    id: "M5",
    prompt: `${BASE}. ${GRAPHITE}. An anvil reduced to a single flat trapezoid in ${OFF_WHITE} with one small ${AMBER} dot floating above the trapezoid.`,
  },
  {
    id: "M6",
    prompt: `${BASE}. ${GRAPHITE}. The letter T as two plain rectangles in ${OFF_WHITE}, no serif, no detail.`,
  },
  {
    id: "M7",
    prompt: `${BASE}. ${PAPER}. The letter T as two plain rectangles: graphite (#16181D) stem and the crossbar in burnt orange (#C2410C), no serif, no detail.`,
  },
  {
    id: "M8",
    prompt: `${BASE}. ${GRAPHITE}. Two thick parallel diagonal bars (like a forged chevron / two strokes) in ${OFF_WHITE}, slightly rounded ends.`,
  },
]

/** LOGO-1b: gpt-image-1 is refused on /v1/images/generations for this account, so no first attempt. */
const MODEL = "gpt-image-1.5"

/** Internal: one image request failed; reported per candidate. */
class LogoFailed extends Data.TaggedError("LogoFailed")<{
  readonly name: string
  readonly reason: string
  readonly retryable: boolean
}> {}

const runGenerate = async () => {
  const apiKey = process.env.OPENAI_API_KEY ?? ""
  if (apiKey.length === 0) {
    console.error("logo:generate: OPENAI_API_KEY is not set. Put it in apps/mobile/.env.images.")
    return process.exit(1)
  }
  registerHooks({
    resolve: (specifier, context, nextResolve) => {
      const parent = context.parentURL
      const candidate =
        parent !== undefined && specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)
          ? [`${specifier}.ts`, `${specifier}/index.ts`].find((s) =>
              existsSync(fileURLToPath(new URL(s, parent))),
            )
          : undefined
      return nextResolve(candidate ?? specifier, context)
    },
  })
  const P = await import("../src/illustrations/imagePrompt")
  mkdirSync(outDir, { recursive: true })
  const only = flag("--only")
    ? Option.getOrElse(
        Option.map(argValue("--only"), (v) => v.split(",")),
        () => [],
      )
    : []
  const selected = CANDIDATES.filter((c) => only.length === 0 || only.includes(c.id))
  /** API calls made, counting retries and the model fallback (reported by the run). */
  const calls = { count: 0 }

  const post = (model: string, prompt: string, signal: AbortSignal) => {
    // biome-ignore lint/plugin/noMutation: run-local call counter for the cost report
    calls.count += 1
    return fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        size: P.IMAGE_SIZE,
        quality: P.IMAGE_QUALITY,
        output_format: "png",
        // gpt-image-1.5 left the background on "auto" and returned alpha for 2 of 9 icons (A1, B2):
        // an icon candidate must be opaque unless --transparent.
        background: flag("--transparent") ? "transparent" : "opaque",
      }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(180_000)]),
    })
  }

  const generate = Effect.fn("generate")(function* (entry: Candidate) {
    const file = join(outDir, `${entry.id}.png`)
    if (existsSync(file)) return yield* Console.log(`  skip ${entry.id} (exists)`)
    const started = performance.now()
    yield* Console.log(`  start ${entry.id} ${new Date().toTimeString().slice(0, 8)}`)
    const request = (model: string) =>
      Effect.tryPromise({
        try: (signal) => post(model, entry.prompt, signal),
        catch: (cause) =>
          new LogoFailed({
            name: entry.id,
            reason: P.redactSecrets(String(cause)),
            retryable: true,
          }),
      })
    const readBody = (response: Response) =>
      Effect.tryPromise({
        try: () => response.json(),
        catch: () =>
          new LogoFailed({
            name: entry.id,
            reason: `HTTP ${response.status}, not JSON`,
            retryable: true,
          }),
      })
    const message = (body: unknown) =>
      Option.match(Schema.decodeUnknownOption(P.ApiErrorBody)(body), {
        onNone: () => "no error message",
        onSome: (e) => P.redactSecrets(e.error.message),
      })
    const response = yield* request(MODEL)
    const body = yield* readBody(response)
    const model = MODEL
    if (!response.ok) {
      return yield* new LogoFailed({
        name: entry.id,
        reason: `HTTP ${response.status}: ${message(body)}`,
        retryable: response.status === 429 || response.status >= 500,
      })
    }
    const image = Option.flatMap(Schema.decodeUnknownOption(P.ImagesResponse)(body), (b) =>
      Option.fromNullishOr(b.data[0]),
    )
    if (Option.isNone(image)) {
      return yield* new LogoFailed({
        name: entry.id,
        reason: "response has no b64_json image",
        retryable: true,
      })
    }
    const bytes = Buffer.from(image.value.b64_json, "base64")
    yield* Effect.try({
      try: () => writeFileSync(file, bytes),
      catch: (cause) =>
        new LogoFailed({
          name: entry.id,
          reason: P.redactSecrets(String(cause)),
          retryable: false,
        }),
    })
    const seconds = ((performance.now() - started) / 1000).toFixed(1)
    yield* Console.log(
      `  wrote ${entry.id}.png (${Math.round(bytes.length / 1024)} KB, ${seconds} s, ${model})`,
    )
  })

  const program = Effect.gen(function* () {
    yield* Console.log(
      `logo:generate ${MODEL} ${P.IMAGE_SIZE} ${P.IMAGE_QUALITY} png${flag("--transparent") ? " transparent" : ""}: ${selected.length} candidates into ${outDir}`,
    )
    const attempt = (entry: Candidate) =>
      generate(entry).pipe(
        Effect.tapError((e) =>
          e.retryable ? Console.error(`  retrying ${e.name}: ${e.reason}`) : Effect.void,
        ),
        Effect.retry({
          times: 2,
          schedule: Schedule.exponential("10 seconds"),
          while: (e) => e.retryable,
        }),
        Effect.result,
      )
    const results = yield* Effect.forEach(selected, attempt, { concurrency: 3 })
    const failures = results.flatMap((r) => (Result.isFailure(r) ? [r.failure] : []))
    yield* Effect.forEach(failures, (f) => Console.error(`  x ${f.name}: ${f.reason}`))
    yield* Console.log(`logo:generate API calls: ${calls.count}`)
    return failures.length
  })
  const failed = await Effect.runPromise(program)
  return process.exit(failed === 0 ? 0 : 1)
}

const PAPER_HEX = "#f6f4ef"
const GRAPHITE_HEX = "#16181d"

const label = (text: string, width: number, height: number, color: string, size: number) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><text x="0" y="${size}" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="${size}" fill="${color}">${text}</text></svg>`,
  )

/** iOS-style rounded tile of `size` px from a candidate file. */
const roundedTile = (file: string, size: number) =>
  sharp(file)
    .resize(size, size)
    .composite([
      {
        input: Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${Math.round(size * 0.2237)}" fill="#fff"/></svg>`,
        ),
        blend: "dest-in",
      },
    ])
    .png()
    .toBuffer()

const runSheet = async () => {
  mkdirSync(sheetDir, { recursive: true })
  const present = CANDIDATES.filter((c) => existsSync(join(outDir, `${c.id}.png`)))
  const tile = 400
  const gap = 24
  const caption = 44
  const cols = 3
  const rows = Math.ceil(present.length / cols)
  const tiles = await Promise.all(
    present.map(async (c, i) => {
      const left = gap + (i % cols) * (tile + gap)
      const top = gap + Math.floor(i / cols) * (tile + caption + gap)
      return [
        { input: await roundedTile(join(outDir, `${c.id}.png`), tile), left, top },
        { input: label(c.id, 200, 36, GRAPHITE_HEX, 28), left, top: top + tile + 8 },
      ]
    }),
  )
  const big = join(sheetDir, `${SHEET_PREFIX}-sheet.png`)
  await sharp({
    create: {
      width: gap + cols * (tile + gap),
      height: gap + rows * (tile + caption + gap),
      channels: 3,
      background: "#d9d6cf",
    },
  })
    .composite(tiles.flat())
    .png()
    .toFile(big)

  const cellW = 300
  const cellH = 150
  const panelW = 140
  const cells = await Promise.all(
    present.map(async (c, i) => {
      const left = gap + (i % cols) * (cellW + gap)
      const top = gap + Math.floor(i / cols) * (cellH + gap)
      const file = join(outDir, `${c.id}.png`)
      const [t60, t29] = await Promise.all([roundedTile(file, 60), roundedTile(file, 29)])
      const panel = (bg: string, x: number) => ({
        input: { create: { width: panelW, height: 100, channels: 3 as const, background: bg } },
        left: left + x,
        top: top + 40,
      })
      return [
        { input: label(c.id, 100, 32, GRAPHITE_HEX, 24), left, top },
        panel(PAPER_HEX, 0),
        panel(GRAPHITE_HEX, panelW + 10),
        { input: t60, left: left + 12, top: top + 60 },
        { input: t29, left: left + 12 + 60 + 16, top: top + 60 + 15 },
        { input: t60, left: left + panelW + 10 + 12, top: top + 60 },
        { input: t29, left: left + panelW + 10 + 12 + 60 + 16, top: top + 60 + 15 },
      ]
    }),
  )
  const small = join(sheetDir, `${SHEET_PREFIX}-sheet-small.png`)
  await sharp({
    create: {
      width: gap + cols * (cellW + gap),
      height: gap + rows * (cellH + gap),
      channels: 3,
      background: "#d9d6cf",
    },
  })
    .composite(cells.flat())
    .png()
    .toFile(small)
  console.log(`logo:sheet wrote ${big} and ${small} (${present.length} candidates)`)
}

if (flag("--sheet")) {
  await runSheet()
} else {
  await runGenerate()
}
