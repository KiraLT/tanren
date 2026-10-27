---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
---

# Test rules

- Colocate: `Foo.ts` → `Foo.test.ts` in the same folder. Vitest, with
  `@effect/vitest` 4 (`import { describe, expect, it, layer } from "@effect/vitest"`)
  for Effect code: `it.effect("...", () => Effect.gen(function* () { ... }))`.
  `it.effect` (TestClock, starts at epoch 0) and `it.live` (real clock) are
  already scoped; there is no `it.scoped` / `it.scopedLive`.
- Name tests by behaviour: `decodes a valid PlannedSet`, `rejects RPE above 10`.
- Schemas: test decode success, decode failure (assert the `SchemaError`
  message or the failing path), and encode→decode round-trip. No snapshot
  tests for schemas. Every `Patch` schema: `{}` decodes to an object with
  zero keys and a one-key input decodes to exactly that key (a field with a
  decoding default inside a derived Patch wiped `locations` in v3). Typed failures: `Effect.flip(eff)` (the error becomes the
  value) or `Effect.result(eff)` + `Result.isFailure`.
- Services: provide test Layers, per test with `.pipe(Effect.provide(L))` or
  shared with `layer(L)("name", (it) => { it.effect(...) })` (one build and
  shared state for the block; the inner `it` has no `.live`). `TestClock` comes
  from `"effect/testing"` (`setTime`, `adjust`; fork with `Effect.forkChild`).
  Never hit the network, the filesystem, or a remote D1. `packages/db` tests run
  inside workerd (`@cloudflare/vitest-plugin`) against a migrated local D1:
  provide `TestLayer` from `packages/db/src/testing/fixtures.ts`; one D1 per test
  file, shared by its tests, so every test uses its own ids.
- Registry-driven code (`SYNC_TABLE_ORDER`, provider lists, migrations):
  tests iterate the registry (`for (const t of SYNC_TABLE_ORDER)`) or pin
  the LAST entry (`tableRank("dailyHealth")`), never a literal mid-range
  sample — a cursor regex with a one-digit rank passed on 9 tables and
  failed on 11 (2026-10-27).
- Paginated or cursor-driven pulls (back-fill, sync pull, feed import): one
  test runs the job N times against a fixture LARGER than one run's page
  budget (e.g. 2 pages × 50 → 120 items) and asserts the cursor reaches
  steady state with every item imported once — a Garmin back-fill stalled
  forever past 100 activities and three review passes plus two QA runs
  missed it because every fixture fitted one run (GM-F1, 2026-10-27).
- Deterministic: no `Date.now()`, no random without a seeded `Random`.
- One assertion idea per test; failures must read as a sentence.
- Keep fixtures tiny and next to the test; build them with the schema's
  constructor (`new X({...})`, `X.make({...})`, `SessionId.make("…")`) or
  from wire JSON with `Schema.decodeUnknownSync(X)(...)`, so they cannot drift.
- A test that reproduces a known defect is `it.fails(...)` /
  `it.effect.fails(...)` with exactly `// DEFECT: <one line>` on the line
  above it — one spelling, no severity in the marker. Fixing the defect means
  dropping `.fails` and the comment; `grep -rn "DEFECT" <paths>` must then
  find nothing in the fixed paths (two spellings once hid 2 of 4 defects).
- Every schema with optional keys (profile, patch, tool input) has a
  minimal-input decode test: `Schema.decodeUnknownSync(X)(<required keys
  only>)` succeeds. `NutritionProfile` required five nullable keys the design
  called optional; only the MCP tool test caught it (N-S2, 2026-10-27).
- A comment or doc line that states what happens on a failure path
  (`Failed → allow`, "the second tab fails after 10 s", "cached by
  ManagedRuntime: the copy asks for a reload") is a claim, and every claim
  has a test or a recorded ui-check repro (two tabs, offline, lock timeout)
  in the same change — or the sentence goes. `useAuthGate` documented the
  second-tab case for five days while the real behaviour was a silent black
  screen (BS-1, 2026-10-27).
- A write path's test asserts the stored row (read it back through the repo
  or the harness and compare the fields), not only that the repo or client
  was called with the right arguments: G-F1's daily-summary tests asserted
  the Garmin calls and never the `daily_health` rows (REV nit, 2026-10-27).
