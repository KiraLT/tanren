# ADR-0002: Biome is the only formatter and linter; functional rules via GritQL plugins

- Status: accepted (owner decision, `docs/plan.md` amendment 2)
- Date: 2026-10-19 · Tasks: S1-T0, S1-T2a/b

## Context
The plan asked for eslint-plugin-functional. The owner then chose Biome only: no ESLint. Biome
2.5.15 has no built-in rule that bans `let`, `class`, `throw`, mutation or loops
(`docs/research/2026-10-19-biome-functional-rules.md`).

## Decision
- `@biomejs/biome` 2.5.15 formats and lints everything, configured in `biome.jsonc`. Formatter: 2
  spaces, width 100, no semicolons, double quotes, trailing commas. The gate runs
  `biome ci --error-on-warnings`.
- Functional rules are enforced in two layers:
  - Built-ins: `useConst`, `noParameterAssign`, `noIncrementDecrement`, `noVar`, `noForIn`.
  - Five GritQL plugins in `.biome/`, with camelCase ids `lint/plugin/<name>`:
    `noLet`, `noThrow`, `noMutation` and `noLoop` are top-level; `noClass` is declared in an
    `overrides` entry that excludes the adapters (`apps/worker/src/mcp/**`,
    `apps/worker/src/index.ts`).
- `noClass` allows Effect class factories: `Context.Service`/`Tag`, `Effect.Service`,
  `Data.TaggedError`/`TaggedClass`, `Schema.Class`/`TaggedError`/`TaggedClass`,
  `HttpApiMiddleware.Service`, and `HttpApi`/`HttpApiGroup.make` chains.
- A plugin self-test (`.biome/selftest.mjs`, `pnpm check:plugins`) runs first in `pnpm check`.
  It lints `.biome/fixtures/` through the real config and asserts the count of plugin
  diagnostics per fixture.

## Consequences
- The plugins are syntactic, not type-aware. Legitimate code such as React `ref.current = …`,
  CommonJS `module.exports` and Expo Router `router.push` needs a
  `// biome-ignore lint/plugin/noMutation: <reason>`.
- A plugin that fails at runtime only emits an info diagnostic and exits 0. Without the self-test,
  a Biome upgrade could disable a rule silently.
- Nursery rules are avoided because they can change between releases.

## Alternatives considered
- ESLint + eslint-plugin-functional (type-aware): rejected by the owner, since it means two
  toolchains.
- `nursery/noJsRestrictedProperties` for mutating methods: it also flags reads, and nursery rules
  are unstable. Kept as a fallback.

## Addendum 2026-10-20 — `noMutation` false positives on own methods

The `.biome/noMutation.grit` plugin is syntactic: it flags any member call named `push`, `pop`,
`shift`, `unshift`, `splice`, `sort`, `reverse` (or `fill`) regardless of the receiver's type. A
method named `push` on one of our own objects (the sync transport in step 6) was flagged although
it mutates nothing.

Decision (Lead, under owner delegation; plan Amendment 3): **keep the rule as is**. A false
positive costs one rename; a missed mutation costs a bug the type system does not catch. Instead,
a naming convention: never name an own method or function after an Array mutator. The sync
transport uses `sendChanges` / `fetchChanges`. Third-party calls that cannot be renamed
(`router.push`, `ref.current = …`) take the one-line
`// biome-ignore lint/plugin/noMutation: <reason>` already described above.

Engineers record this convention in `.claude/skills/effect-conventions` (not part of this ADR).
