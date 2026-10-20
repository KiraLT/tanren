import { defineConfig } from "vitest/config"

// Tests here are plain Node (`node:sqlite`, Effect): never load React Native / .tsx files.
export default defineConfig({
  test: {
    name: "@tanren/mobile",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
})
