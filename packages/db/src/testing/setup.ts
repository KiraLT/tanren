import { applyD1Migrations } from "cloudflare:test"
import { env } from "cloudflare:workers"

// Runs before every test file, inside workerd: each file starts from a freshly migrated D1.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
