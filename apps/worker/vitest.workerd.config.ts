import { fileURLToPath } from "node:url"
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin"
import { defineProject } from "vitest/config"

// `readD1Migrations` resolves against the process cwd, which is the repo root under `pnpm check`,
// so the path is anchored to this file instead.
const migrations = fileURLToPath(new URL("../../packages/db/migrations", import.meta.url))

// Runs `*.workerd.test.ts` inside workerd against a freshly migrated local D1: the Worker's real
// runtime. The Node project (`vitest.config.ts`) keeps the logic tests and excludes these.
export default defineProject({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.test.jsonc" },
      miniflare: {
        bindings: { TEST_MIGRATIONS: await readD1Migrations(migrations) },
      },
    })),
  ],
  test: {
    name: "@tanren/worker-workerd",
    include: ["src/**/*.workerd.test.ts"],
    setupFiles: ["./src/testing/workerdSetup.ts"],
  },
})
