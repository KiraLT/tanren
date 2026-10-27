import { applyD1Migrations } from "cloudflare:test"
import { env } from "cloudflare:workers"

// Runs before every workerd test file: each file starts from a freshly migrated D1 (0000 to 0006:
// `readD1Migrations` in vitest.workerd.config.ts reads the whole migrations folder, 0006 = token generations).
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
