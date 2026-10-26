/**
 * `node --env-file-if-exists=.env.images scripts/generateLogo.ts [--out <dir>] [--transparent] [--only A1,C2]`
 * (LOGO-1; `pnpm logo:generate`): nine app-icon candidates (three directions x three variants) from
 * OpenAI `P.IMAGE_MODEL` (`POST /v1/images/generations`, plain fetch, 1024x1024 png, medium) written to
 * `<out>/<id>.png` (default `assets/brand/candidates`, git-ignored). A refused model (400 mentioning
 * "model") falls back once to `gpt-image-1.5`. Existing files are skipped, so a re-run retries only failures.
 * Cost: about $0.04 per medium image, nine = about $0.4 (the run is capped at the nine ids).
 * `--sheet` writes the two contact sheets (`docs/design/screens/LOGO-1-sheet.png` and
 * `LOGO-1-sheet-small.png`, 60 and 29 px renders on paper and graphite) with sharp; needs no key.
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
  "flat vector app-icon mark, single bold shape, no text, no letters, no gradients except one amber glow, centred, generous margin"
const GRAPHITE = "solid graphite background (#16181D)"
const PAPER = "solid warm paper background (#F6F4EF)"

type Candidate = { readonly id: string; readonly prompt: string }
const CANDIDATES: ReadonlyArray<Candidate> = [
  {
    id: "A1",
    prompt: `${BASE}, ${GRAPHITE}. The Japanese kanji 鍛 abstracted into two or three bold monoline strokes that also read as a barbell bar and plates; amber (#F59E0B) strokes on graphite.`,
  },
  {
    id: "A2",
    prompt: `${BASE}, ${GRAPHITE}. A barbell seen side-on built from three thick amber (#F59E0B) monoline strokes, the strokes echoing the structure of the kanji 鍛 (forging) without drawing it literally; heavy rounded line caps.`,
  },
  {
    id: "A3",
    prompt: `${BASE}, ${PAPER}. The Japanese kanji 鍛 abstracted into two or three bold monoline strokes that also read as a barbell bar and plates; deep burnt-orange (#C2410C) strokes on paper.`,
  },
  {
    id: "B1",
    prompt: `${BASE}, ${GRAPHITE}. A minimal geometric anvil silhouette, heavy, stable, slightly rounded corners, in light steel grey, with a single amber (#F59E0B) spark / ember above it.`,
  },
  {
    id: "B2",
    prompt: `${BASE}, ${GRAPHITE}. A chunky blocky anvil icon built from two or three flat shapes, off-white (#F6F4EF) body, one small teardrop amber (#F59E0B) ember floating above the horn with a soft amber glow.`,
  },
  {
    id: "B3",
    prompt: `${BASE}, ${PAPER}. A minimal geometric anvil silhouette in dark graphite (#16181D), heavy, stable, slightly rounded corners, with a single burnt-orange (#C2410C) spark above it.`,
  },
  {
    id: "C1",
    prompt: `${BASE}, ${GRAPHITE}. The capital letter T drawn as a forged steel bar, brutalist, very thick, with an amber (#F59E0B) heat gradient glowing at the crossbar; the one glow is the gradient, flat steel grey elsewhere.`,
  },
  {
    id: "C2",
    prompt: `${BASE}, ${GRAPHITE}. A bold block letter T made of a thick hammered iron bar, squared brutalist proportions, the crossbar heated to glowing amber (#F59E0B) fading into dark steel at the stem.`,
  },
  {
    id: "C3",
    prompt: `${BASE}, ${PAPER}. The capital letter T as a forged steel bar, brutalist, thick, dark graphite (#16181D) stem with an amber-to-burnt-orange (#C2410C) heat gradient at the crossbar.`,
  },
]

const FALLBACK_MODEL = "gpt-image-1.5"

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
    const first = yield* request(P.IMAGE_MODEL)
    const firstBody = yield* readBody(first)
    const modelRefused = !first.ok && first.status === 400 && /model/i.test(message(firstBody))
    const [response, body, model] = modelRefused
      ? yield* Effect.gen(function* () {
          yield* Console.log(
            `  ${entry.id}: ${P.IMAGE_MODEL} refused, falling back to ${FALLBACK_MODEL}`,
          )
          const second = yield* request(FALLBACK_MODEL)
          return [second, yield* readBody(second), FALLBACK_MODEL] as const
        })
      : ([first, firstBody, P.IMAGE_MODEL] as const)
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
      `logo:generate ${P.IMAGE_MODEL} ${P.IMAGE_SIZE} ${P.IMAGE_QUALITY} png${flag("--transparent") ? " transparent" : ""}: ${selected.length} candidates into ${outDir}`,
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
  const big = join(sheetDir, "LOGO-1-sheet.png")
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
  const small = join(sheetDir, "LOGO-1-sheet-small.png")
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
