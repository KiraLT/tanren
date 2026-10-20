import type { Env } from "./Env"

// Typed `cloudflare:workers` env (research 2026-10-20 Q3): workers-types ships it empty. The
// merge lives in an ambient file so production types see `env.DB` and the vars, and only the test
// project adds `TEST_MIGRATIONS` (`src/testing/env.d.ts`).
declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {}
  }
}
type WorkerEnv = Env
