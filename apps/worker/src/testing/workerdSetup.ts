import { applyD1Migrations } from "cloudflare:test"
import { env } from "cloudflare:workers"

// Runs before every workerd test file: each file starts from a freshly migrated D1 (0000 to 0007:
// `readD1Migrations` in vitest.workerd.config.ts reads the whole migrations folder, 0007 = Garmin import).
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
