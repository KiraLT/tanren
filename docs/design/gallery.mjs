#!/usr/bin/env node
// Review-gallery manifest (GAL-2, GAL-3). Reads the gallery HTML (default: the tracked source
// docs/design/screens/tanren-screens.html, named on stderr), writes <screensDir>/gallery.json and prints
// (a) the Artifact `files` map for every referenced shot, (b) shots missing on disk, (c) duplicate badges.
// Exit code 1 when (b) or (c) is non-empty. A manifest shot `{ "file": …, "store": true }` lives only in the
// artifact store: it is not "missing" and not in the files map. gallery.json is rewritten only with --write.
// Usage: node docs/design/gallery.mjs [gallery.html] [screensDir] [--publish] [--write]
//   gallery.html: path relative to the cwd or absolute; omit it to read the tracked source.
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
const defaultHtml = join(repoRoot, "docs", "design", "screens", "tanren-screens.html")
const argv = process.argv.slice(2)
const publish = argv.includes("--publish")
const write = argv.includes("--write")
const positional = argv.filter((a) => a !== "--publish" && a !== "--write")
const htmlPath = positional[0] ?? defaultHtml
const screensArg = positional[1] ?? "docs/design/screens"
const screensDir = resolve(repoRoot, screensArg)

console.error(`gallery.mjs: reading ${htmlPath}`)
const html = readFileSync(htmlPath, "utf8")
const strip = (text) =>
  text
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
const unique = (items) => [...new Set(items)]

// Everything between one `<section id="…">` and the next (or the end of the page).
const chunks = html.split(/<section\s+id="/).slice(1)
const sections = chunks.map((chunk) => {
  const id = chunk.slice(0, chunk.indexOf('"'))
  const body = chunk.split("</section>")[0] ?? chunk
  const title = strip(/<h2[^>]*>([\s\S]*?)<\/h2>/.exec(body)?.[1] ?? "")
  const badges = [...body.matchAll(/<span class="badge"[^>]*>([\s\S]*?)<\/span>/g)].map((m) =>
    strip(m[1] ?? ""),
  )
  const shots = unique(
    [...body.matchAll(/<img[^>]*\ssrc="shots\/([^"]+)"/g)].map((m) => m[1] ?? ""),
  )
  return { badges, id, shots, title }
})

const manifestPath = join(screensDir, "gallery.json")
const readManifest = () => {
  try {
    return JSON.parse(readFileSync(manifestPath, "utf8"))
  } catch {
    return { sections: [] }
  }
}
const shotName = (shot) => (typeof shot === "string" ? shot : shot.file)
// Shots the existing manifest marks as store-only (kept only while the PNG is still absent on disk).
const storeMarked = new Set(
  readManifest().sections.flatMap((s) =>
    s.shots.filter((shot) => typeof shot !== "string" && shot.store === true).map(shotName),
  ),
)
const onDisk = (f) => existsSync(join(screensDir, f))
const isStore = (f) => storeMarked.has(f) && !onDisk(f)

// No timestamp: the manifest only changes when the HTML does.
const nextManifest = {
  sections: sections.map((s) => ({
    ...s,
    shots: s.shots.map((f) => (isStore(f) ? { file: f, store: true } : f)),
  })),
}
const nextText = `${JSON.stringify(nextManifest, null, 2)}\n`
const currentText = existsSync(manifestPath) ? readFileSync(manifestPath, "utf8") : ""
if (write) {
  writeFileSync(manifestPath, nextText)
} else if (nextText !== currentText) {
  const knownIds = new Set(readManifest().sections.map((s) => s.id))
  const knownShots = new Set(readManifest().sections.flatMap((s) => s.shots.map(shotName)))
  const newSections = sections.filter((s) => !knownIds.has(s.id)).length
  const newShots = unique(sections.flatMap((s) => s.shots)).filter((f) => !knownShots.has(f)).length
  console.error(`manifest: ${newSections} new sections / ${newShots} new shots (run with --write)`)
}

const allShots = unique(sections.flatMap((s) => s.shots)).sort()
const diskShots = allShots.filter((f) => !isStore(f))
const files = Object.fromEntries(diskShots.map((f) => [`shots/${f}`, `${screensArg}/${f}`]))
const missing = diskShots.filter((f) => !onDisk(f))

const seen = new Map()
for (const s of sections) {
  for (const b of s.badges) {
    seen.set(b, [...(seen.get(b) ?? []), s.id])
  }
}
const duplicates = [...seen.entries()].filter(([, where]) => where.length > 1)

if (publish) {
  // Only the map on stdout (pipe-able); shots that live only in the published artifact are kept
  // there by the publish (files left out are kept), so missing ones are a warning, not a failure.
  const present = Object.fromEntries(
    Object.entries(files).filter(([, path]) => existsSync(resolve(repoRoot, path))),
  )
  console.log(JSON.stringify(present, null, 2))
  if (missing.length > 0) {
    console.error(`warning: ${missing.length} referenced shots not on disk (kept from earlier publish)`)
    for (const f of missing) console.error(`  ${f}`)
  }
  for (const [badge, where] of duplicates) {
    console.error(`duplicate badge ${badge}: ${where.join(", ")}`)
  }
  process.exit(duplicates.length > 0 ? 1 : 0)
}

console.log("== files map ==")
console.log(JSON.stringify(files, null, 2))
console.log(`\n== sections: ${sections.length}, badges: ${[...seen.values()].flat().length}, shots: ${allShots.length} ==`)
console.log(`\n== missing files (${missing.length}) ==`)
for (const f of missing) console.log(`  ${f}`)
console.log(`\n== duplicate badges (${duplicates.length}) ==`)
for (const [badge, where] of duplicates) console.log(`  ${badge}: ${where.join(", ")}`)

process.exitCode = missing.length > 0 || duplicates.length > 0 ? 1 : 0
