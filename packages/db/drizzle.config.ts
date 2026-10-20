import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "sqlite",
  // `!(*.test)` keeps parity.test.ts (it imports vitest, which cannot load in drizzle-kit's CJS).
  schema: "./src/schema/!(*.test).ts",
  out: "./migrations",
})
