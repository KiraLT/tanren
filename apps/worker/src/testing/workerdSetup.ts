import { applyD1Migrations } from "cloudflare:test"
import { env } from "cloudflare:workers"

// Runs before every workerd test file: each file starts from a freshly migrated D1 (0000 + 0001).
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
