// Test-only binding that vitest.workerd.config.ts injects next to `DB` (see wrangler.test.jsonc).
declare namespace Cloudflare {
  interface Env {
    readonly TEST_MIGRATIONS: Array<import("cloudflare:test").D1Migration>
  }
}
