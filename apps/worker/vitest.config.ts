import { defineProject } from "vitest/config"

// Node project: logic tests through `makeApp(...).handler(new Request(...))` with memory
// persistence. `*.workerd.test.ts` need workerd and run in `vitest.workerd.config.ts`.
export default defineProject({
  test: {
    name: "@tanren/worker",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    exclude: ["src/**/*.workerd.test.ts", "**/node_modules/**"],
  },
})
