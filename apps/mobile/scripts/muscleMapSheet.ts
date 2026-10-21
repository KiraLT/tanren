/**
 * `node scripts/muscleMapSheet.ts`: writes `src/illustrations/muscleMap/_contact-sheet.html`, the
 * muscle map for eight catalog exercises in light and dark, painted exactly like `MuscleMap.tsx`
 * (same geometry, tones and style constants). Dev-time only (git-ignored output); node:fs is fine.
 * Same extensionless-import resolve hook as `resolveTs.ts`.
 */
import { existsSync, writeFileSync } from "node:fs"
import { registerHooks } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

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

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const { CATALOG } = await import("@tanren/shared")
const body = await import("../src/illustrations/muscleMap/body")
const regions = await import("../src/illustrations/muscleMap/regions")
const { lightColors, darkColors } = await import("../src/ui/colors")

const EXERCISES = [
  "barbell-back-squat",
  "barbell-bench-press",
  "pull-up",
  "plank",
  "conventional-deadlift",
  "dumbbell-lateral-raise",
  "barbell-curl",
  "outdoor-run",
]
const SIZE = 320
const scale = body.VIEW_BOX_SIZE / SIZE

type Colors = typeof lightColors
type Entry = (typeof CATALOG)[number]

const path = (d: string, attrs: string) => `<path d="${d}" ${attrs}/>`

const svg = (entry: Entry, colors: Colors): string => {
  const tone = regions.regionTone(entry.primaryMuscles, entry.secondaryMuscles)
  const seam = `stroke="${colors.bg}" stroke-width="${body.MUSCLE_MAP_STYLE.seamWidth * scale}" stroke-linejoin="round"`
  const panels = body.PANELS.map((panel) => {
    const silhouette = body.SILHOUETTE[panel]
    const muscles = body.REGIONS.filter((r) => r.panel === panel).flatMap((region) => {
      const t = tone(region.id)
      const fill =
        t === "primary"
          ? `fill="${colors.accent}" fill-opacity="${body.MUSCLE_MAP_STYLE.primaryOpacity}"`
          : t === "secondary"
            ? `fill="${colors.accent}" fill-opacity="${body.MUSCLE_MAP_STYLE.secondaryOpacity}"`
            : `fill="${colors.border}"`
      return t === "idle" && region.idle === "hidden"
        ? []
        : region.paths.map((d) => path(d, `${fill} ${seam}`))
    })
    return [
      ...silhouette.fill.map((d) => path(d, `fill="${colors.surface}"`)),
      ...body.DETAILS[panel].map((d) => path(d, `fill="${colors.border}" ${seam}`)),
      ...muscles,
      ...silhouette.outline.map((d) =>
        path(
          d,
          `fill="none" stroke="${colors.textMuted}" stroke-width="${body.MUSCLE_MAP_STYLE.outlineWidth * scale}" stroke-linecap="round" stroke-linejoin="round"`,
        ),
      ),
    ].join("")
  }).join("")
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${body.VIEW_BOX_SIZE} ${body.VIEW_BOX_SIZE}" width="${SIZE}" height="${SIZE}">${panels}</svg>`
}

const cell = (entry: Entry, colors: Colors) =>
  `<figure style="background:${colors.bg};color:${colors.text}"><div>${svg(entry, colors)}</div><figcaption>${entry.name}<br><small>${regions.muscleMapLabel(entry.primaryMuscles, entry.secondaryMuscles)}</small></figcaption></figure>`

const entries = EXERCISES.flatMap((id) => CATALOG.filter((entry) => entry.catalogId === id))
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Muscle map</title>
<style>body{margin:0;font:13px system-ui;background:#888}main{display:grid;grid-template-columns:repeat(4,${SIZE + 24}px);gap:8px;padding:8px}figure{margin:0;padding:12px}figcaption{width:${SIZE}px}small{opacity:.7}</style>
</head><body><main>${entries.map((e) => cell(e, lightColors)).join("")}${entries.map((e) => cell(e, darkColors)).join("")}</main></body></html>`

const out = join(root, "src/illustrations/muscleMap/_contact-sheet.html")
writeFileSync(out, html)
console.log(`muscle map sheet: ${entries.length} exercises → ${out}`)
