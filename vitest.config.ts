import { defineConfig } from "vitest/config"

// One Vitest project per workspace package. A folder without its own vitest.config.ts is a
// project with default settings, named after its package.json "name" (e.g. @tanren/shared).
// A package that needs special settings (e.g. the Workers pool) adds its own vitest.config.ts.
export default defineConfig({
  test: {
    // apps/worker has a second, workerd project (its own config file next to the Node one).
    projects: ["apps/*", "packages/*", "apps/worker/vitest.workerd.config.ts"],
  },
})
