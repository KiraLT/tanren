import { applyD1Migrations } from "cloudflare:test"
import { env } from "cloudflare:workers"

// Runs before every workerd test file: each file starts from a freshly migrated D1 (0000 to 0010:
// `readD1Migrations` in vitest.workerd.config.ts reads the whole migrations folder, 0008 = nutrition,
// 0009 = user programs, 0010 = refresh-token burn ledger).
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
