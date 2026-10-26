/**
 * `node --env-file-if-exists=.env.images scripts/generateLanding.ts [--only hero,log]`
 * (ILL-1; `pnpm -F @tanren/mobile landing:generate`): the five landing illustrations of
 * `docs/design/landing.md` section 5 from OpenAI `gpt-image-1.5` (`POST /v1/images/generations`, plain
 * fetch, 1024x1024 png, quality high, transparent background; `gpt-image-1` is refused for this account)
 * written to `assets/landing/raw/<id>.png` (git-ignored). Existing raw files are skipped, so a re-run
 * retries only failures. A response without real transparency is discarded and requested again.
 * Cost: about $0.20 per high image, five = about $1.00 per attempt.
 *
 * `node scripts/generateLanding.ts --shrink` (`landing:shrink`) needs no key: raw PNGs to
 * `assets/landing/<id>.webp` with sharp (hero 1024, others 512, alpha kept).
 *
 * The key comes from `node --env-file-if-exists=.env.images`; this script never prints it, and API
 * error text goes through `redactSecrets`.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { registerHooks } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { Console, Data, Effect, Option, Result, Schedule, Schema } from "effect"
import sharp from "sharp"

const here = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const flag = (name: string) => argv.includes(name)
const argValue = (name: string) => Option.fromNullishOr(argv[argv.indexOf(name) + 1])
const landingDir = join(here, "..", "assets", "landing")
const rawDir = join(landingDir, "raw")

/** LOGO-1b: gpt-image-1 is refused on /v1/images/generations for this account. */
const MODEL = "gpt-image-1.5"
const SIZE = "1024x1024"
const QUALITY = "high"

/** `docs/design/landing.md` section 5, verbatim. */
const STYLE =
  "Minimal Japanese sumi-e brush illustration: a few bold tapered ink strokes with dry-brush ends, flat solid fills in muted slate (#64748B), exactly ONE accent stroke in amber (#F59E0B), nothing else coloured. Transparent background, no backdrop shape, no floor, no shadow, no gradient, no texture, no outline, no text, no letters, no logo. Square, centred, generous margin (about 12 percent), 2D vector look."

type Motif = { readonly id: string; readonly px: number; readonly prompt: string }
const MOTIFS: ReadonlyArray<Motif> = [
  {
    id: "hero",
    px: 1024,
    prompt: `${STYLE} One athlete at the top of a barbell deadlift, bar at hip height, seen in three-quarter view, body in slate strokes; the barbell is the single amber stroke.`,
  },
  {
    id: "log",
    px: 512,
    prompt: `${STYLE} A stack of three round weight plates seen slightly from above, two slate and the top one amber, with a bold plus sign drawn as two brush strokes floating above them; the plus sign and every gap between the plates are slate (#64748B) or amber (#F59E0B), never black or dark grey.`,
  },
  {
    id: "program",
    px: 512,
    prompt: `${STYLE} One athlete holding a plank in side view, slate strokes, under a three-quarter circular amber arc like a timer ring above the body.`,
  },
  {
    id: "feed",
    px: 512,
    prompt: `${STYLE} Three stacked rounded rectangles drawn as brush outlines, offset like cards in a pile, the front card carrying one short amber horizontal stroke.`,
  },
  {
    id: "plan",
    px: 512,
    prompt: `${STYLE} Seven small squares in a row drawn as rough brush outlines, like a week, the fourth square filled solid amber, a single slate check stroke above it.`,
  },
]

/** Internal: one image request failed; reported per motif. */
class LandingFailed extends Data.TaggedError("LandingFailed")<{
  readonly name: string
  readonly reason: string
  readonly retryable: boolean
}> {}

/** True when the PNG has an alpha channel that is actually used (some pixel below 255). */
const hasRealAlpha = async (bytes: Buffer): Promise<boolean> => {
  const meta = await sharp(bytes).metadata()
  if (meta.hasAlpha !== true) return false
  const { channels } = await sharp(bytes).stats()
  const alpha = channels[channels.length - 1]
  return alpha !== undefined && alpha.min < 255
}

const runShrink = async () => {
  const results = await Promise.all(
    MOTIFS.map(async (m) => {
      const source = join(rawDir, `${m.id}.png`)
      if (!existsSync(source)) return `  missing raw ${m.id}.png`
      const target = join(landingDir, `${m.id}.webp`)
      const info = await sharp(source)
        .resize(m.px, m.px, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 82, alphaQuality: 90 })
        .toFile(target)
      return `  ${m.id}.webp ${info.width}x${info.height} ${Math.round(info.size / 1024)} KB`
    }),
  )
  console.log(`landing:shrink\n${results.join("\n")}`)
  return process.exit(results.some((r) => r.startsWith("  missing")) ? 1 : 0)
}

const runGenerate = async () => {
  const apiKey = process.env.OPENAI_API_KEY ?? ""
  if (apiKey.length === 0) {
    console.error("landing:generate: OPENAI_API_KEY is not set. Put it in apps/mobile/.env.images.")
    return process.exit(1)
  }
  // imagePrompt.ts has extensionless relative imports; plain node needs the same hook as generateLogo.ts.
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
  mkdirSync(rawDir, { recursive: true })
  const only = flag("--only")
    ? Option.getOrElse(
        Option.map(argValue("--only"), (v) => v.split(",")),
        () => [],
      )
    : []
  const selected = MOTIFS.filter((m) => only.length === 0 || only.includes(m.id))
  /** API calls made, counting retries (reported for the cost line). */
  const calls = { count: 0 }

  const post = (entry: Motif, signal: AbortSignal) => {
    // biome-ignore lint/plugin/noMutation: run-local call counter for the cost report
    calls.count += 1
    return fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        prompt: entry.prompt,
        n: 1,
        size: SIZE,
        quality: QUALITY,
        output_format: "png",
        // gpt-image-1.5 sometimes ignores the background (generateLogo.ts); hasRealAlpha checks it.
        background: "transparent",
      }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(300_000)]),
    })
  }

  const generate = Effect.fn("generate")(function* (entry: Motif) {
    const file = join(rawDir, `${entry.id}.png`)
    if (existsSync(file)) return yield* Console.log(`  skip ${entry.id} (exists)`)
    const started = performance.now()
    yield* Console.log(`  start ${entry.id} ${new Date().toTimeString().slice(0, 8)}`)
    const failed = (reason: string, retryable: boolean) =>
      new LandingFailed({ name: entry.id, reason, retryable })
    const response = yield* Effect.tryPromise({
      try: (signal) => post(entry, signal),
      catch: (cause) => failed(P.redactSecrets(String(cause)), true),
    })
    const body = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: () => failed(`HTTP ${response.status}, not JSON`, true),
    })
    if (!response.ok) {
      const text = Option.match(Schema.decodeUnknownOption(P.ApiErrorBody)(body), {
        onNone: () => "no error message",
        onSome: (e) => P.redactSecrets(e.error.message),
      })
      return yield* failed(
        `HTTP ${response.status}: ${text}`,
        response.status === 429 || response.status >= 500,
      )
    }
    const image = Option.flatMap(Schema.decodeUnknownOption(P.ImagesResponse)(body), (b) =>
      Option.fromNullishOr(b.data[0]),
    )
    if (Option.isNone(image)) return yield* failed("response has no b64_json image", true)
    const bytes = Buffer.from(image.value.b64_json, "base64")
    const transparent = yield* Effect.tryPromise({
      try: () => hasRealAlpha(bytes),
      catch: (cause) => failed(P.redactSecrets(String(cause)), false),
    })
    if (!transparent)
      return yield* failed("returned without transparency (opaque), discarded", true)
    yield* Effect.try({
      try: () => writeFileSync(file, bytes),
      catch: (cause) => failed(P.redactSecrets(String(cause)), false),
    })
    const seconds = ((performance.now() - started) / 1000).toFixed(1)
    yield* Console.log(
      `  wrote ${entry.id}.png (${Math.round(bytes.length / 1024)} KB, ${seconds} s, alpha ok)`,
    )
  })

  const program = Effect.gen(function* () {
    yield* Console.log(
      `landing:generate ${MODEL} ${SIZE} ${QUALITY} png transparent: ${selected.length} images into ${rawDir}`,
    )
    const attempt = (entry: Motif) =>
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
    const results = yield* Effect.forEach(selected, attempt, { concurrency: 5 })
    const failures = results.flatMap((r) => (Result.isFailure(r) ? [r.failure] : []))
    yield* Effect.forEach(failures, (f) => Console.error(`  x ${f.name}: ${f.reason}`))
    yield* Console.log(
      `landing:generate API calls: ${calls.count} (about $${(calls.count * 0.2).toFixed(2)} at high)`,
    )
    return failures.length
  })
  const failed = await Effect.runPromise(program)
  return process.exit(failed === 0 ? 0 : 1)
}

const main = flag("--shrink") ? runShrink : runGenerate
await main()
