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
  tests for schemas. Typed failures: `Effect.flip(eff)` (the error becomes the
  value) or `Effect.result(eff)` + `Result.isFailure`.
- Services: provide test Layers, per test with `.pipe(Effect.provide(L))` or
  shared with `layer(L)("name", (it) => { it.effect(...) })` (one build and
  shared state for the block; the inner `it` has no `.live`). `TestClock` comes
  from `"effect/testing"` (`setTime`, `adjust`; fork with `Effect.forkChild`).
  Never hit the network, the filesystem, or a remote D1. `packages/db` tests run
  inside workerd (`@cloudflare/vitest-plugin`) against a migrated local D1:
  provide `TestLayer` from `packages/db/src/testing/fixtures.ts`; one D1 per test
  file, shared by its tests, so every test uses its own ids.
- Deterministic: no `Date.now()`, no random without a seeded `Random`.
- One assertion idea per test; failures must read as a sentence.
- Keep fixtures tiny and next to the test; build them with the schema's
  constructor (`new X({...})`, `X.make({...})`, `SessionId.make("…")`) or
  from wire JSON with `Schema.decodeUnknownSync(X)(...)`, so they cannot drift.
