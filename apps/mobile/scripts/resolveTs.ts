/**
 * Preload for the image scripts (`node --import ./scripts/resolveTs.ts …`): `@tanren/shared` and our
 * sources use extensionless relative imports (`moduleResolution: bundler`), which Node's ESM
 * resolver rejects, so this sync resolve hook retries `<specifier>.ts` and `<specifier>/index.ts`.
 * `generateIllustrations.ts` and `muscleMapSheet.ts` register their own copy of this hook.
 */
import { existsSync } from "node:fs"
import { registerHooks } from "node:module"
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
