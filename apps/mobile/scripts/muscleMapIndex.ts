/**
 * `node --import ./scripts/resolveTs.ts scripts/muscleMapIndex.ts`: writes
 * src/illustrations/muscleMapImages.ts, a static `require` map of every
 * `assets/musclemaps/<catalogId>.webp`, then formats it with Biome so the gate stays green.
 * Run after `shrinkMuscleMaps.ts`.
 */
import { execFileSync } from "node:child_process"
import { readdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { Array as Arr, Order } from "effect"
import {
  MUSCLE_MAP_DIR,
  MUSCLE_MAP_FILE,
  muscleMapImagesSource,
} from "../src/illustrations/muscleMapPrompt"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const ids = Arr.sort(
  readdirSync(join(root, MUSCLE_MAP_DIR))
    .filter((file) => /^[a-z0-9-]+\.webp$/.test(file))
    .map((file) => file.replace(/\.webp$/, "")),
  Order.String,
)
writeFileSync(join(root, MUSCLE_MAP_FILE), muscleMapImagesSource(ids))
execFileSync("pnpm", ["exec", "biome", "format", "--write", MUSCLE_MAP_FILE], {
  cwd: root,
  stdio: "ignore",
})
console.log(`muscleMapIndex wrote ${MUSCLE_MAP_FILE} with ${ids.length} images`)
