/**
 * Writes `assets/illustrations/_contact-sheet.html` listing every `<id>.webp` in that folder.
 * Imported by generateIllustrations.ts after its resolve hook is registered (the extensionless
 * import below needs it), so it is not a standalone entry point.
 */
import { readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { Array as Arr, Order } from "effect"
import { IMAGE_DIR, IMAGE_SHEET, imageContactSheet } from "../src/illustrations/imagePrompt"

/** Returns the number of images on the sheet. */
export const writeContactSheet = (packageRoot: string): number => {
  const ids = Arr.sort(
    readdirSync(join(packageRoot, IMAGE_DIR))
      .filter((file) => /^[a-z0-9-]+\.webp$/.test(file))
      .map((file) => file.replace(/\.webp$/, "")),
    Order.String,
  )
  writeFileSync(join(packageRoot, IMAGE_SHEET), imageContactSheet(ids))
  return ids.length
}
