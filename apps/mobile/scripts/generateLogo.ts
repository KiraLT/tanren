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
/** `--wordmark` (LOGO-3 candidates) or `--wordmark-final` (LOGO-4, W1 at quality high). */
const wordmarkRun = flag("--wordmark") || flag("--wordmark-final")
const outDir = resolve(
  Option.getOrElse(flag("--out") ? argValue("--out") : Option.none(), () =>
    join(
      here,
      "..",
      "assets",
      "brand",
      "candidates",
      wordmarkRun || flag("--wordmark-sheet") ? "wordmark" : "",
    ),
  ),
)
const sheetDir = join(here, "..", "..", "..", "docs", "design", "screens")

const BASE =
  "ultra-minimal flat vector app icon, two or three bold strokes at most, flat solid colour, NO gradient, NO glow, NO texture, NO outline, NO shadow, NO text other than the described strokes, generous margin, centred, crisp edges, 2D, brush-calligraphy proportions but perfectly flat fills"
const GRAPHITE = "graphite background (#16181D)"
const PAPER = "paper background (#F6F4EF)"
const OFF_WHITE = "off-white (#F6F4EF)"
const AMBER = "amber (#F59E0B)"
const INK = "graphite (#16181D)"
const BURNT = "burnt-orange (#C2410C)"

/**
 * The round's contact-sheet prefix and image ids (LOGO-1c: M8's two-stroke idea crossed with minimal
 * Japanese strokes, ids J1 to J8). Reference, the LOGO-1b winner M8 (BASE was the LOGO-1b text):
 * "ultra-minimal flat vector app icon, geometric, a single solid colour on a solid background plus at most
 * one small accent, NO gradient, NO glow, NO bevel, NO texture, NO outline, NO shadow, NO text, at most two
 * shapes, generous margin, centred, crisp edges, 2D. solid graphite background (#16181D). Two thick
 * parallel diagonal bars (like a forged chevron / two strokes) in off-white (#F6F4EF), slightly rounded ends."
 */
const SHEET_PREFIX = "LOGO-1c"

type Candidate = {
  readonly id: string
  readonly prompt: string
  /** `--final` entries only: the image background the request asks for. */
  readonly background?: "opaque" | "transparent"
  /** `--wordmark` entries only: the request size (landscape). */
  readonly size?: string
}
const CANDIDATES: ReadonlyArray<Candidate> = [
  {
    id: "J1",
    prompt: `${BASE}. ${GRAPHITE}. Two parallel diagonal brush strokes rising left-to-right, slightly tapered ends like sumi-e, ${OFF_WHITE} on graphite.`,
  },
  {
    id: "J2",
    prompt: `${BASE}. ${GRAPHITE}. The Japanese kanji 力 (strength) drawn as two bold flat brush strokes, ${OFF_WHITE} on graphite, generous margin.`,
  },
  {
    id: "J3",
    prompt: `${BASE}. ${GRAPHITE}. The kanji 力 as two strokes, the first stroke ${OFF_WHITE} and the second (the hooked sweeping stroke) ${AMBER}.`,
  },
  {
    id: "J4",
    prompt: `${BASE}. ${GRAPHITE}. The katakana タ (ta) reduced to its two or three strokes as flat brush shapes, ${OFF_WHITE} on graphite.`,
  },
  {
    id: "J5",
    prompt: `${BASE}. ${GRAPHITE}. Two parallel diagonal strokes in ${OFF_WHITE} with one short ${AMBER} dash crossing the lower stroke, like a brush accent.`,
  },
  {
    id: "J6",
    prompt: `${BASE}. ${GRAPHITE}. An abstract three-stroke mark suggesting the kanji 鍛 (forge): one vertical stroke, one long diagonal, one short horizontal, ${OFF_WHITE} on graphite, not a legible character.`,
  },
  {
    id: "J7",
    prompt: `${BASE}. ${PAPER}. Two ${INK} diagonal brush strokes with a small ${BURNT} circle (hanko seal dot) at the lower right.`,
  },
  {
    id: "J8",
    prompt: `${BASE}. ${PAPER}. The kanji 力 in ${INK} brush strokes with the stroke ends tapered, no accent.`,
  },
]

/**
 * LOGO-2 (`--final`): the owner's pick J3 (kanji 力, off-white first stroke, amber hook, on graphite) redrawn
 * at quality `high` as three finals. `--final` writes `<out>/F-icon.png`, `F-paper.png`, `F-mark.png`; a
 * second attempt goes to another `--out` dir. `--export <dir>` (no key) turns the chosen raw files in `<dir>`
 * into the tracked `assets/brand/*.png` and the PWA icons under `public/icons/`.
 * Cost: about $0.20 per high image, three = about $0.60 per attempt.
 */
const FINAL_QUALITY = "high"
const FINAL_CORE =
  "the Japanese kanji 力 drawn as exactly two bold flat brush strokes with tapered ends, heavier stroke weight than typical, the first stroke FIRST_COLOR and the second hooked sweeping stroke SECOND_COLOR, perfectly flat solid background, no gradient, no glow, no texture, no outline, no shadow, no other marks, the glyph filling about 60% of the canvas, centred"
const finalPrompt = (first: string, second: string, background: string) =>
  `${FINAL_CORE.replace("FIRST_COLOR", first).replace("SECOND_COLOR", second)}. ${background}.`
const FINALS: ReadonlyArray<Candidate> = [
  {
    id: "F-icon",
    prompt: finalPrompt(OFF_WHITE, AMBER, `Solid ${GRAPHITE}`),
    background: "opaque",
  },
  {
    id: "F-paper",
    prompt: finalPrompt(INK, BURNT, `Solid ${PAPER}`),
    background: "opaque",
  },
  {
    id: "F-mark",
    prompt: finalPrompt(OFF_WHITE, AMBER, "Transparent background, only the two strokes"),
    background: "transparent",
  },
]

/**
 * LOGO-3 (`--wordmark`, plan Amendment 14): six lettered-wordmark candidates W1 to W6, 1536x1024 transparent
 * png at quality medium (about $0.04 each, about $0.25 per run; one extra call per id that returns no alpha),
 * written to `assets/brand/candidates/wordmark/` (git-ignored). Owner: "Currently we have more like icon than
 * the logo ... Maybe we need logo variation where Tanren is written in icon like style?"
 * `--wordmark-sheet` (no key) builds `docs/design/screens/LOGO-3-wordmark-sheet.png`, the sign-in mock and
 * the gallery rows fragment `LOGO-3-rows.html`.
 */
const WORD_CORE =
  "vector-like flat ink #16181D on a transparent background, perfectly flat solid fills, no texture, no background, no glow, no shadow, no extra marks, dry-brush restraint, one single ink weight, bold hand-brushed lettering with tapered stroke ends in the same flat two-stroke brush language as a brush kanji, legible at 80 px wide, generous margin, centred"
const WORD_MARK =
  "the Japanese kanji 力 drawn as exactly two bold flat brush strokes with tapered ends, heavier stroke weight than typical, the first stroke ink #16181D and the second hooked sweeping stroke amber #F59E0B, the glyph about as tall as the capital letters"
const WORD_AMBER = "amber #F59E0B"
const WORDMARKS: ReadonlyArray<Candidate> = [
  {
    id: "W1",
    prompt: `${WORD_CORE}. The word TANREN in capital letters, brush-lettered, one line, wide letter spacing. Exactly one accent: the crossbar of the T has a short hooked ${WORD_AMBER} stroke. Everything else ink.`,
  },
  {
    id: "W2",
    prompt: `${WORD_CORE}. A horizontal logo lockup: ${WORD_MARK}, at the left; the word TANREN in capital brush letters to its right, all ink, baseline aligned with the bottom of the kanji. The amber hook appears only on the kanji mark, never on the letters.`,
  },
  {
    id: "W3",
    prompt: `${WORD_CORE}. The word TANREN in condensed, heavier capital lettering with the proportions of Barlow Condensed Bold but hand-brushed, no serif, tight spacing. Exactly one accent: the final N has its last diagonal stroke in ${WORD_AMBER} with a small hook. Everything else ink.`,
  },
  {
    id: "W4",
    prompt: `${WORD_CORE}. A horizontal logo lockup: ${WORD_MARK}, at the left; the word TANREN in capital brush letters to its right, baseline aligned. Under the Latin letters a small line of Japanese 鍛錬 brushed in the same ink, about 40 percent of the height of the Latin letters. The amber hook appears only on the kanji mark.`,
  },
  {
    id: "W5",
    prompt: `${WORD_CORE}. A stacked logo lockup, centred: ${WORD_MARK}, above; the word TANREN in capital brush letters below it, all ink, the word about as wide as the kanji is tall. The amber hook appears only on the kanji mark.`,
  },
  {
    id: "W6",
    prompt: `${WORD_CORE}. A ligature wordmark: the word TANREN where the T is the first stroke of the kanji 力 (the long diagonal stroke with its horizontal bar) in ink and the second hooked sweeping stroke of 力 in ${WORD_AMBER} sits as the accent beside it, and the remaining letters A N R E N follow in the same brush, one line, all ink.`,
  },
].map((entry) => ({ ...entry, background: "transparent", size: "1536x1024" }))

/**
 * LOGO-4 (`--wordmark-final`, plan Amendment 15, owner pick W1): W1's prompt once at quality `high`
 * (about $0.25, one image) into `candidates/wordmark/W1-final.png`. `--w1-export <png>` (no key) builds
 * the tracked wordmark and the T-mark icon set from it.
 */
const WORDMARK_FINAL: ReadonlyArray<Candidate> = WORDMARKS.filter((c) => c.id === "W1").map(
  (c) => ({ ...c, id: "W1-final" }),
)

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
  const table = flag("--wordmark-final")
    ? WORDMARK_FINAL
    : flag("--wordmark")
      ? WORDMARKS
      : flag("--final")
        ? FINALS
        : CANDIDATES
  const selected = table.filter((c) => only.length === 0 || only.includes(c.id))
  /** Ids already re-requested once for coming back without alpha (`--wordmark`). */
  const noAlphaRetried = new Set<string>()
  const quality = flag("--final") || flag("--wordmark-final") ? FINAL_QUALITY : P.IMAGE_QUALITY
  /** API calls made, counting retries and the model fallback (reported by the run). */
  const calls = { count: 0 }

  const post = (model: string, entry: Candidate, signal: AbortSignal) => {
    // biome-ignore lint/plugin/noMutation: run-local call counter for the cost report
    calls.count += 1
    return fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        prompt: entry.prompt,
        n: 1,
        size: entry.size ?? P.IMAGE_SIZE,
        quality,
        output_format: "png",
        // gpt-image-1.5 left the background on "auto" and returned alpha for 2 of 9 icons (A1, B2):
        // an icon candidate must be opaque unless --transparent (or the final says so).
        background: entry.background ?? (flag("--transparent") ? "transparent" : "opaque"),
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
        try: (signal) => post(model, entry, signal),
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
    if (entry.background === "transparent") {
      const alpha = yield* Effect.promise(() =>
        sharp(bytes)
          .metadata()
          .then((m) => m.hasAlpha),
      )
      if (alpha !== true) {
        // One re-request per id (the retry schedule below), then a hard failure.
        const again = !noAlphaRetried.has(entry.id)
        noAlphaRetried.add(entry.id)
        return yield* new LogoFailed({
          name: entry.id,
          reason: "no alpha channel in a transparent request",
          retryable: again,
        })
      }
    }
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
      `logo:generate ${MODEL} ${wordmarkRun ? "1536x1024" : P.IMAGE_SIZE} ${quality} png${flag("--transparent") ? " transparent" : ""}: ${selected.length} candidates into ${outDir}`,
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
    const results = yield* Effect.forEach(selected, attempt, { concurrency: 6 })
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

/**
 * LOGO-2 export. The model drifts its flat colours (graphite came back as about #282B33, strokes a shade
 * off) and `background: transparent` returned a glow, so a final is never used raw: the glyph is keyed out
 * of the generated image (alpha from the distance to the corner-estimated background, scaled to the distance
 * between the background and the brand stroke colour, noise floor `KEY_FLOOR`), every pixel gets the exact
 * brand stroke colour of its class (accent when red minus blue is above `ACCENT_RB`), the matte is trimmed,
 * and the glyph is re-centred on a solid brand background or on transparency at a stated fraction of the
 * canvas. `F-icon` provides the transparent mark and the dark tiles, `F-paper` the paper tile.
 */
type Rgb = readonly [number, number, number]
const hexRgb = (hex: string): Rgb => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
]
const distance = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const KEY_FLOOR = 10
const KEY_SATURATION = 0.7
const ACCENT_RB = 40

type Palette = { readonly bg: string; readonly first: string; readonly accent: string }
const DARK_PALETTE: Palette = { bg: "#16181D", first: "#F6F4EF", accent: "#F59E0B" }
const PAPER_PALETTE: Palette = { bg: "#F6F4EF", first: "#16181D", accent: "#C2410C" }

/** The glyph as a trimmed RGBA png buffer in exact brand colours. */
const keyGlyph = async (file: string, palette: Palette): Promise<Buffer> => {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const at = (x: number, y: number): Rgb => {
    const i = (y * info.width + x) * 3
    return [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0]
  }
  const corners = [
    at(2, 2),
    at(info.width - 3, 2),
    at(2, info.height - 3),
    at(info.width - 3, info.height - 3),
  ]
  const mean = (channel: 0 | 1 | 2) =>
    corners.reduce((sum, c) => sum + c[channel], 0) / corners.length
  const bg: Rgb = [mean(0), mean(1), mean(2)]
  const first = hexRgb(palette.first)
  const accent = hexRgb(palette.accent)
  const rgba = Array.from({ length: info.width * info.height }, (_, n) => {
    const p = at(n % info.width, Math.floor(n / info.width))
    const stroke = p[0] - p[2] > ACCENT_RB ? accent : first
    const full = distance(stroke, bg)
    // Opaque from KEY_SATURATION of the expected distance: the model's strokes are a shade off brand.
    const span = full * KEY_SATURATION - KEY_FLOOR
    const alpha = Math.min(1, Math.max(0, (distance(p, bg) - KEY_FLOOR) / span))
    return [stroke[0], stroke[1], stroke[2], Math.round(alpha * 255)]
  })
  return sharp(Uint8Array.from(rgba.flat()), {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .trim({ threshold: 8 })
    .png()
    .toBuffer()
}

/** `glyph` fitted to `fraction` of a `size` canvas and centred on `background` (none = transparent). */
const tile = async (
  glyph: Buffer,
  size: number,
  fraction: number,
  background: Option.Option<string>,
) => {
  const box = Math.round(size * fraction)
  const fitted = await sharp(glyph).resize(box, box, { fit: "inside" }).png().toBuffer()
  const composed = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: Option.getOrElse(background, () => "#00000000"),
    },
  }).composite([{ input: fitted, gravity: "centre" }])
  // A solid background means an opaque file (iOS rejects alpha in the app icon).
  return (Option.isSome(background) ? composed.removeAlpha() : composed)
    .png({ compressionLevel: 9, palette: true, quality: 100, effort: 10 })
    .toBuffer()
}

const runExport = async (rawDir: string) => {
  const dark = await keyGlyph(join(rawDir, "F-icon.png"), DARK_PALETTE)
  const paper = await keyGlyph(join(rawDir, "F-paper.png"), PAPER_PALETTE)
  const brand = join(here, "..", "assets", "brand")
  const icons = join(here, "..", "public", "icons")
  mkdirSync(icons, { recursive: true })
  const graphite = Option.some(DARK_PALETTE.bg)
  const jobs: ReadonlyArray<readonly [string, Promise<Buffer>]> = [
    [join(brand, "icon.png"), tile(dark, 1024, 0.6, graphite)],
    [join(brand, "adaptive-icon.png"), tile(dark, 1024, 0.58, graphite)],
    [join(brand, "splash-icon.png"), tile(dark, 512, 0.76, Option.none())],
    [join(brand, "favicon.png"), tile(dark, 48, 0.76, graphite)],
    [join(brand, "mark.png"), tile(dark, 512, 0.76, Option.none())],
    [join(brand, "mark-paper.png"), tile(paper, 512, 0.6, Option.some(PAPER_PALETTE.bg))],
    [join(icons, "icon-192.png"), tile(dark, 192, 0.6, graphite)],
    [join(icons, "icon-512.png"), tile(dark, 512, 0.6, graphite)],
    [join(icons, "maskable-512.png"), tile(dark, 512, 0.5, graphite)],
    [join(icons, "apple-touch-180.png"), tile(dark, 180, 0.6, graphite)],
  ]
  await Promise.all(
    jobs.map(async ([file, bytes]) => {
      const buffer = await bytes
      writeFileSync(file, buffer)
      console.log(`logo:export ${file} ${buffer.length} bytes`)
    }),
  )
}

/**
 * LOGO-3 sheets. The candidates are dark ink on transparency, so the dark ground gets the ink recoloured to
 * off-white (the amber accent keeps its colour; alpha is untouched, so any halo the model drew would show).
 */
const ONE_GROUND = {
  paper: { bg: PAPER_HEX, ink: hexRgb("#16181D") },
  dark: { bg: GRAPHITE_HEX, ink: hexRgb("#F6F4EF") },
} as const

const recolourInk = async (file: string, ink: Rgb): Promise<Buffer> => {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const pixels = Array.from({ length: info.width * info.height }, (_, n) => {
    const i = n * 4
    const [r, g, b] = [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0]
    const accent = r - b > ACCENT_RB
    return accent ? [r, g, b, data[i + 3] ?? 0] : [ink[0], ink[1], ink[2], data[i + 3] ?? 0]
  })
  return sharp(Uint8Array.from(pixels.flat()), {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer()
}

/** The candidate trimmed to its ink bounds, recoloured for a ground. */
const wordmarkOn = async (id: string, ground: keyof typeof ONE_GROUND): Promise<Buffer> =>
  sharp(await recolourInk(join(outDir, `${id}.png`), ONE_GROUND[ground].ink))
    .trim({ threshold: 8 })
    .png()
    .toBuffer()

const WORDMARK_IDS = ["W1", "W2", "W3", "W4", "W5", "W6"] as const
const ROWS_FILE = "LOGO-3-rows.html"

const rowsHtml = () => {
  const figure = (badges: ReadonlyArray<string>, name: string, small: string, shot: string) =>
    `    <figure><figcaption>${badges.map((b) => `<span class="badge">${b}</span>`).join("")}<span class="name">${name}<small>${small}</small></span></figcaption><a class="shot" href="shots/${shot}" target="_blank"><img src="shots/${shot}" alt="${name}" loading="lazy"></a></figure>`
  return `<section id="wordmark">
  <h2>Lettered wordmark candidates (LOGO-3)</h2>
  <p class="sub">W1 TANREN alone, amber hook on the T. W2 lockup, mark left. W3 condensed, hook on the final N. W4 lockup with 鍛錬. W5 stacked. W6 ligature (the T is the first stroke of 力). Each on paper (top) and dark (below); then W2 and W5 on the sign-in grounds.</p>
  <div class="grid wide">
${figure(WORDMARK_IDS, "Wordmarks", "paper and dark rows, 1536x1024 transparent, medium", "LOGO-3-wordmark-sheet.png")}
${figure(["mock"], "Sign-in mock", "W2 and W5, light and dark, 2x", "LOGO-3-wordmark-signin-mock.png")}
  </div>
</section>
`
}

const runWordmarkSheet = async () => {
  mkdirSync(sheetDir, { recursive: true })
  const tileW = 480
  const tileH = 320
  const gap = 24
  const caption = 44
  const cols = 3
  const cellH = tileH * 2 + caption
  const place = async (id: string, ground: keyof typeof ONE_GROUND, left: number, top: number) => {
    const glyph = await sharp(await wordmarkOn(id, ground))
      .resize(tileW - 80, tileH - 80, { fit: "inside" })
      .png()
      .toBuffer()
    const base = await sharp({
      create: { width: tileW, height: tileH, channels: 3, background: ONE_GROUND[ground].bg },
    })
      .composite([{ input: glyph, gravity: "centre" }])
      .png()
      .toBuffer()
    return { input: base, left, top }
  }
  const tiles = await Promise.all(
    WORDMARK_IDS.flatMap((id, i) => {
      const left = gap + (i % cols) * (tileW + gap)
      const top = gap + Math.floor(i / cols) * (cellH + gap)
      return [
        place(id, "paper", left, top),
        place(id, "dark", left, top + tileH),
        Promise.resolve({
          input: label(id, 200, 36, GRAPHITE_HEX, 28),
          left,
          top: top + tileH * 2 + 8,
        }),
      ]
    }),
  )
  await sharp({
    create: {
      width: gap + cols * (tileW + gap),
      height: gap + 2 * (cellH + gap),
      channels: 3,
      background: "#d9d6cf",
    },
  })
    .composite(tiles)
    .png()
    .toFile(join(sheetDir, "LOGO-3-wordmark-sheet.png"))

  // Sign-in mock at 2x: a 390 px phone column per scheme; W2 trimmed to a 48 px (96 px at 2x) lockup height,
  // W5 stacked at 88 px (176 px at 2x) so its 力 is about 48 px.
  const colW = 780
  const pad = 32
  const rowH = 680
  const grounds = [
    { ground: "paper", page: "#FFFFFF", text: "#16181D", field: "#F5F5F5" },
    { ground: "dark", page: "#0F1113", text: "#F6F4EF", field: "#16181D" },
  ] as const
  const lockups = [
    { id: "W2", height: 96 },
    { id: "W5", height: 176 },
  ] as const
  const panels = await Promise.all(
    lockups.flatMap(({ id, height }, row) =>
      grounds.map(async (g, col) => {
        const lockup = await sharp(await wordmarkOn(id, g.ground))
          .resize({ height })
          .png()
          .toBuffer()
        const ui = Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${colW}" height="${rowH}"><text x="${pad}" y="${pad + 96 + 200}" font-family="Helvetica, Arial, sans-serif" font-weight="800" font-size="72" fill="${g.text}">Sign in</text><rect x="${pad}" y="${pad + 96 + 260}" width="${colW - pad * 2}" height="88" rx="16" fill="${g.field}"/><rect x="${pad}" y="${pad + 96 + 372}" width="${colW - pad * 2}" height="100" rx="50" fill="#C2410C"/></svg>`,
        )
        return [
          {
            input: await sharp({
              create: { width: colW, height: rowH, channels: 3, background: g.page },
            })
              .png()
              .toBuffer(),
            left: col * (colW + gap),
            top: row * (rowH + gap),
          },
          { input: ui, left: col * (colW + gap), top: row * (rowH + gap) },
          { input: lockup, left: col * (colW + gap) + pad, top: row * (rowH + gap) + pad },
        ]
      }),
    ),
  )
  await sharp({
    create: {
      width: 2 * colW + gap,
      height: 2 * rowH + gap,
      channels: 3,
      background: "#d9d6cf",
    },
  })
    .composite(panels.flat())
    .png()
    .toFile(join(sheetDir, "LOGO-3-wordmark-signin-mock.png"))
  writeFileSync(join(sheetDir, ROWS_FILE), rowsHtml())
  console.log(
    `logo:wordmark-sheet wrote the sheet, the sign-in mock and ${ROWS_FILE} in ${sheetDir}`,
  )
}

/**
 * LOGO-4 export (`--w1-export <png>`, no key): the owner's W1 (transparent, ink + one amber hook) becomes the
 * tracked wordmark and the T mark. The T is the 4-connected ink component that holds the leftmost ink pixel,
 * plus every amber pixel (the prompt allows one accent, the T's hook), plus the anti-aliased rim within 2 px.
 * Ink and accent are recoloured to the exact brand pair of the ground; alpha is kept.
 */
type Raw = { readonly data: Buffer; readonly width: number; readonly height: number }

const readRaw = async (file: string): Promise<Raw> => {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}
const alphaAt = (raw: Raw, n: number) => raw.data[n * 4 + 3] ?? 0
const isAccent = (raw: Raw, n: number) =>
  (raw.data[n * 4] ?? 0) - (raw.data[n * 4 + 2] ?? 0) > ACCENT_RB && alphaAt(raw, n) >= 128

/** Indices of the 4-connected component of `inside` that holds `seed` (frontier by frontier). */
const component = (raw: Raw, inside: (n: number) => boolean, seed: number): ReadonlySet<number> => {
  const seen = new Set<number>([seed])
  const grow = (frontier: ReadonlyArray<number>): ReadonlySet<number> =>
    frontier.length === 0
      ? seen
      : grow(
          frontier.flatMap((n) =>
            [
              n % raw.width > 0 ? n - 1 : -1,
              n % raw.width < raw.width - 1 ? n + 1 : -1,
              n - raw.width,
              n + raw.width,
            ].filter((m) => {
              if (m < 0 || m >= raw.width * raw.height || seen.has(m) || !inside(m)) return false
              seen.add(m)
              return true
            }),
          ),
        )
  return grow([seed])
}

/** `raw` with ink → `palette.first`, accent → `palette.accent`, pixels outside `keep` cleared, trimmed. */
const recolour = (raw: Raw, palette: Palette, keep: (n: number) => boolean) => {
  const first = hexRgb(palette.first)
  const accent = hexRgb(palette.accent)
  const pixels = Array.from({ length: raw.width * raw.height }, (_, n) => {
    const colour = (raw.data[n * 4] ?? 0) - (raw.data[n * 4 + 2] ?? 0) > ACCENT_RB ? accent : first
    return [colour[0], colour[1], colour[2], keep(n) ? alphaAt(raw, n) : 0]
  })
  return sharp(Uint8Array.from(pixels.flat()), {
    raw: { width: raw.width, height: raw.height, channels: 4 },
  })
    .trim({ threshold: 1 })
    .png()
    .toBuffer()
}

/** Membership test for the T: its ink component, the accent, and the soft rim within 2 px of either. */
const tMember = (raw: Raw): ((n: number) => boolean) => {
  const total = raw.width * raw.height
  const indices = Array.from({ length: total }, (_, n) => n)
  const ink = (n: number) => alphaAt(raw, n) >= 128 && !isAccent(raw, n)
  const seed = indices
    .filter(ink)
    .reduce((best, n) => (n % raw.width < best % raw.width ? n : best), indices.find(ink) ?? 0)
  const core = component(raw, ink, seed)
  const solid = (n: number) => core.has(n) || isAccent(raw, n)
  const offsets = [-2, -1, 0, 1, 2].flatMap((dy) =>
    [-2, -1, 0, 1, 2].map((dx) => dy * raw.width + dx),
  )
  return (n) =>
    solid(n) || (alphaAt(raw, n) < 128 && offsets.some((o) => n + o >= 0 && solid(n + o)))
}

const writeOut = (file: string, buffer: Buffer) => {
  writeFileSync(file, buffer)
  console.log(`logo:w1 ${file} ${buffer.length} bytes`)
}

const runW1Export = async (source: string) => {
  const raw = await readRaw(source)
  const brand = join(here, "..", "assets", "brand")
  const icons = join(here, "..", "public", "icons")
  const isT = tMember(raw)
  const everything = () => true
  const [tDark, tPaper, wordDark, wordPaper] = await Promise.all([
    recolour(raw, DARK_PALETTE, isT),
    recolour(raw, PAPER_PALETTE, isT),
    recolour(raw, DARK_PALETTE, everything),
    recolour(raw, PAPER_PALETTE, everything),
  ])
  const graphite = Option.some(DARK_PALETTE.bg)
  const wide = (glyph: Buffer) =>
    sharp(glyph)
      .resize({ width: 1280 })
      .png({ compressionLevel: 9, palette: true, quality: 100, effort: 10 })
      .toBuffer()
  const jobs: ReadonlyArray<readonly [string, Promise<Buffer>]> = [
    [join(brand, "icon.png"), tile(tDark, 1024, 0.6, graphite)],
    [join(brand, "adaptive-icon.png"), tile(tDark, 1024, 0.58, graphite)],
    [join(brand, "splash-icon.png"), tile(tDark, 512, 0.76, Option.none())],
    [join(brand, "favicon.png"), tile(tDark, 48, 0.84, graphite)],
    [join(brand, "mark.png"), tile(tDark, 512, 0.76, Option.none())],
    [join(brand, "mark-paper.png"), tile(tPaper, 512, 0.76, Option.none())],
    [join(brand, "wordmark.png"), wide(wordDark)],
    [join(brand, "wordmark-paper.png"), wide(wordPaper)],
    [join(icons, "icon-192.png"), tile(tDark, 192, 0.6, graphite)],
    [join(icons, "icon-512.png"), tile(tDark, 512, 0.6, graphite)],
    [join(icons, "maskable-512.png"), tile(tDark, 512, 0.5, graphite)],
    [join(icons, "apple-touch-180.png"), tile(tDark, 180, 0.6, graphite)],
  ]
  await Promise.all(jobs.map(async ([file, bytes]) => writeOut(file, await bytes)))
  await runW1Sheet(brand)
}

/** LOGO-4 contact sheet: the icon at 1024/180/60/32, the T mark and the lockup on paper and graphite. */
const runW1Sheet = async (brand: string) => {
  const rounded = (size: number) => roundedTile(join(brand, "icon.png"), size)
  const fit = (file: string, width: number, height: number) =>
    sharp(join(brand, file)).resize(width, height, { fit: "inside" }).png().toBuffer()
  const panel = (bg: string, left: number, top: number, width: number, height: number) => ({
    input: { create: { width, height, channels: 3 as const, background: bg } },
    left,
    top,
  })
  const W = 1600
  const parts = [
    { input: await rounded(512), left: 32, top: 32 },
    { input: await rounded(180), left: 576, top: 32 },
    { input: await rounded(60), left: 788, top: 32 },
    { input: await rounded(32), left: 880, top: 32 },
    {
      input: label("1024 (at 512) · 180 · 60 · 32", 700, 40, GRAPHITE_HEX, 28),
      left: 576,
      top: 240,
    },
    panel(PAPER_HEX, 576, 300, 480, 244),
    panel(GRAPHITE_HEX, 1088, 300, 480, 244),
    { input: await fit("mark-paper.png", 200, 200), left: 576 + 140, top: 322 },
    { input: await fit("mark.png", 200, 200), left: 1088 + 140, top: 322 },
    { input: await fit("mark-paper.png", 32, 32), left: 576 + 24, top: 500 },
    { input: await fit("mark.png", 32, 32), left: 1088 + 24, top: 500 },
    panel(PAPER_HEX, 32, 576, 760, 280),
    panel(GRAPHITE_HEX, 808, 576, 760, 280),
    { input: await fit("wordmark-paper.png", 640, 200), left: 92, top: 616 },
    { input: await fit("wordmark.png", 640, 200), left: 868, top: 616 },
    { input: await fit("wordmark-paper.png", 400, 56), left: 92, top: 790 },
    { input: await fit("wordmark.png", 400, 56), left: 868, top: 790 },
  ]
  await sharp({ create: { width: W, height: 888, channels: 3, background: "#d9d6cf" } })
    .composite(parts)
    .png()
    .toFile(join(sheetDir, "LOGO-4-sheet.png"))
  console.log("logo:w1 wrote docs/design/screens/LOGO-4-sheet.png")
}

/**
 * BRAND-2b (`--og`, no key): `public/og.png`, the 1200 x 630 social image. The paper-ink lockup
 * (`wordmark-paper.svg`: off-white ink, amber hook) rendered at 760 px wide, centred on graphite.
 */
const OG_WIDTH = 1200
const OG_HEIGHT = 630
const OG_LOCKUP_WIDTH = 760

const runOg = async () => {
  const svg = join(here, "..", "assets", "brand", "wordmark-paper.svg")
  const lockup = await sharp(svg, { density: 300 })
    .resize({ width: OG_LOCKUP_WIDTH })
    .png()
    .toBuffer()
  const file = join(here, "..", "public", "og.png")
  await sharp({
    create: { width: OG_WIDTH, height: OG_HEIGHT, channels: 4, background: DARK_PALETTE.bg },
  })
    .composite([{ input: lockup, gravity: "centre" }])
    .removeAlpha()
    .png({ compressionLevel: 9, palette: true, quality: 100, effort: 10 })
    .toFile(file)
  console.log(`logo:og wrote ${file}`)
}

if (flag("--og")) {
  await runOg()
} else if (flag("--w1-export")) {
  await runW1Export(
    resolve(Option.getOrElse(argValue("--w1-export"), () => join(outDir, "wordmark", "W1.png"))),
  )
} else if (flag("--wordmark-sheet")) {
  await runWordmarkSheet()
} else if (flag("--export")) {
  await runExport(resolve(Option.getOrElse(argValue("--export"), () => outDir)))
} else if (flag("--sheet")) {
  await runSheet()
} else {
  await runGenerate()
}
