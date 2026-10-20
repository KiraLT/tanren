import { fileURLToPath } from "node:url"
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin"
import { defineProject } from "vitest/config"

// `readD1Migrations` resolves against the process cwd, which is the repo root under `pnpm check`.
const migrations = fileURLToPath(new URL("./migrations", import.meta.url))

// Repository tests run inside workerd against a migrated local D1 (docs/design/db.md §8).
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
    name: "@tanren/db",
    setupFiles: ["./src/testing/setup.ts"],
  },
})
