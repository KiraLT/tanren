/**
 * `pnpm images:map`: writes src/illustrations/images.ts, a static `require` map of every
 * `assets/illustrations/<catalogId>.webp`, then formats it with Biome so the gate stays green.
 * Run after `pnpm images:generate`. Needs `--import ./scripts/resolveTs.ts` (package.json).
 */
import { execFileSync } from "node:child_process"
import { readdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { Array as Arr, Order } from "effect"
import { IMAGE_DIR, IMAGE_MAP_FILE, imageMapSource } from "../src/illustrations/imagePrompt"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const ids = Arr.sort(
  readdirSync(join(root, IMAGE_DIR))
    .filter((file) => /^[a-z0-9-]+\.webp$/.test(file))
    .map((file) => file.replace(/\.webp$/, "")),
  Order.String,
)
writeFileSync(join(root, IMAGE_MAP_FILE), imageMapSource(ids))
execFileSync("pnpm", ["exec", "biome", "format", "--write", IMAGE_MAP_FILE], {
  cwd: root,
  stdio: "ignore",
})
console.log(`images:map wrote ${IMAGE_MAP_FILE} with ${ids.length} images`)
