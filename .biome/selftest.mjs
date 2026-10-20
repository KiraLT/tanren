// Plugin self-test (`pnpm check:plugins`, first step of `pnpm check`).
// A GritQL plugin that breaks at runtime only emits an info diagnostic and Biome still exits 0,
// so a rule could silently stop applying. This lints .biome/fixtures/ with the repo's real
// biome.jsonc and asserts the number of plugin errors per fixture. The fixtures are force-ignored
// by biome.jsonc, so they are copied into a temp workspace whose config only `extends` the real
// one; plugin paths resolve relative to the extending config, hence the `.biome` symlink.
import { spawnSync } from "node:child_process"
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const repo = fileURLToPath(new URL("..", import.meta.url))
const biome = join(repo, "node_modules", ".bin", "biome")

// [fixture, path it is linted as, expected `::error title=plugin` lines]
const cases = [
  ["noLet.positive.ts", "packages/selftest/noLet.ts", 8],
  ["noClass.positive.ts", "packages/selftest/noClass.ts", 9],
  ["noThrow.positive.ts", "packages/selftest/noThrow.ts", 3],
  ["noMutation.positive.ts", "packages/selftest/noMutation.ts", 24],
  ["noLoop.positive.ts", "packages/selftest/noLoop.ts", 5],
  ["noClass.positive.ts", "apps/worker/src/mcp/noClass.ts", 0], // adapter exemption
  ...["noLet", "noClass", "noThrow", "noMutation", "noLoop"].map((rule) => [
    `${rule}.negative.ts`,
    `packages/selftest/${rule}.negative.ts`,
    0,
  ]),
]

const workspace = mkdtempSync(join(tmpdir(), "tanren-biome-selftest-"))
writeFileSync(
  join(workspace, "biome.jsonc"),
  JSON.stringify({ root: true, extends: [join(repo, "biome.jsonc")], vcs: { enabled: false } }),
)
symlinkSync(join(repo, ".biome"), join(workspace, ".biome"), "dir")
cases.forEach(([fixture, target]) => {
  mkdirSync(dirname(join(workspace, target)), { recursive: true })
  copyFileSync(join(repo, ".biome", "fixtures", fixture), join(workspace, target))
})

const results = cases.map(([fixture, target, expected]) => {
  const run = spawnSync(biome, ["lint", "--colors=off", "--reporter=github", target], {
    cwd: workspace,
    encoding: "utf8",
  })
  const lines = `${run.stdout}${run.stderr}`.split("\n")
  const errors = lines.filter((line) => line.startsWith("::error title=plugin,")).length
  const broken = lines.filter((line) =>
    / errored: |Error\(s\) during loading of plugins/.test(line),
  )
  return {
    fixture,
    target,
    expected,
    errors,
    broken,
    ok: errors === expected && broken.length === 0,
  }
})
rmSync(workspace, { recursive: true, force: true })

console.log(
  results
    .map(
      (r) =>
        `${r.ok ? "ok  " : "FAIL"} ${r.fixture} as ${r.target}: ${r.errors} plugin errors (expected ${r.expected})${r.broken.length > 0 ? ` ${r.broken.join(" | ")}` : ""}`,
    )
    .join("\n"),
)
process.exit(results.every((r) => r.ok) ? 0 : 1)
