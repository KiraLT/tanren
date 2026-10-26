import { Schema } from "effect"
import { CatalogId } from "./taxonomy"

/**
 * The frozen core-30 set (v2-catalog.md §3): every id exists in `data/core.ts`, kind timed or reps
 * per ADR-0020, with `core` among its primary muscles. The programs team builds its core-30 plan from these.
 * Decoded at module load, so a malformed slug is a defect the catalog test catches.
 */
export const CORE30_CATALOG_IDS: ReadonlyArray<CatalogId> = Schema.decodeUnknownSync(
  Schema.Array(CatalogId),
)([
  "plank",
  "side-plank",
  "dead-bug",
  "bicycle-crunch",
  "mountain-climber",
  "lying-leg-raise",
  "flutter-kick",
  "russian-twist",
  "hollow-hold",
  "bird-dog",
  "reverse-crunch",
  "heel-touch",
  "crunch",
  "sit-up",
  "v-up",
  "glute-bridge",
  "superman-hold",
  "scissor-kick",
  "plank-shoulder-tap",
  "plank-hip-dip",
  "toe-touch-crunch",
  "leg-raise-hold",
  "bear-crawl-hold",
  "high-knees",
])
