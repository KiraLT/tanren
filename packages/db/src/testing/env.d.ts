// Bindings of wrangler.test.jsonc plus the migrations vitest.config.ts injects (test-only).
declare namespace Cloudflare {
  interface Env {
    readonly DB: D1Database
    readonly TEST_MIGRATIONS: Array<import("cloudflare:test").D1Migration>
  }
}
