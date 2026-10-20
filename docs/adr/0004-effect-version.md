# ADR-0004: Effect 4.0.5 for all `@effect/*` packages

- Status: accepted (Lead decision under owner delegation, 2026-10-20; plan Amendment 3)
- Date: 2026-10-19 · Task: S1-T1 · Author: engineer, on the Lead's instruction
- Decision confirmed 2026-10-20: already built on; the root gate (`pnpm check`) is green at 307 tests on `effect@4.0.5` / `@effect/vitest@4.0.5`.

## Context

`docs/plan.md` names Effect 3 APIs: `Context.Tag`, `@effect/platform` HttpApi,
`@effect/sql-d1`, `@effect/sql-drizzle`. On 2026-10-19 the registry showed the following
(`npm view effect dist-tags`; details in `docs/research/2026-10-19-toolchain-versions.md` §D):

- `effect`: `latest 4.0.5`, `prev 3.22.3`. 4.0.0 went GA on 2026-10-01 with LTS: bug fixes until
  September 2029 (or one year after 5.0), security fixes until September 2029 (or two years after
  5.0). No LTS statement exists for 3.x.
- In v4, HTTP, HttpApi and SQL are built into core: `effect/http`, `effect/http-api`,
  `effect/sql`. That is why `@effect/platform` (latest 0.97.2) and `@effect/sql` (0.52.1) stay
  on the v3 line.
- `@effect/sql-d1@4.0.5` exists (peer `effect ^4.0.5`). **`@effect/sql-drizzle` has no v4**:
  latest is 0.51.0, with peers `effect ^3.22`, `@effect/sql ^0.52`, `drizzle-orm <0.50`.
- `@effect/vitest@4.0.5` peers `effect ^4.0.5` and `vitest >=5 <6`. On 3.x the newest
  `@effect/vitest` is 0.30.0, which peers `vitest ^3.2.0`. Staying on 3.x would therefore also
  have held Vitest at 3.2.x instead of the latest major.

The S1-T1 brief first said to pin 3.x. The Lead replaced that with 4.0.5 after the research
above.

## Decision

- `effect: 4.0.5` and `@effect/vitest: 4.0.5` are exact pins in the pnpm catalog. Every future
  `@effect/*` package uses the same version, because the v4 ecosystem shares one version number.
- As a consequence: `vitest: 5.0.5`, plus `vite: 8.3.4`, which is a required peer of vitest 5.
- How the plan's names map to v4:

| Plan (v3) | v4 |
|---|---|
| `Context.Tag` | `Context.Service` |
| `@effect/platform` HttpApi | `effect/http-api` |
| `@effect/sql` | `effect/sql` |
| `@effect/sql-d1` | `@effect/sql-d1@4.0.5` |
| `@effect/sql-drizzle` | none |
| `Schema.decodeUnknown` / `ParseError` | `Schema.decodeUnknownEffect` / `Schema.SchemaError` |
| `it.scoped` (`@effect/vitest`) | `it.effect` (already scoped) |

Verified in this repo with `pnpm -F @tanren/shared test` (2 tests pass):
`it.effect` + `Schema.decodeUnknownEffect(Schema.FiniteFromString)("42")` decodes to `42`, and
`"forty-two"` fails with a `SchemaError` whose message is `Expected a finite number`.
Watch out: v4 `Schema.NumberFromString` decodes non-numeric text to `NaN` instead of failing.

## Consequences

- The owner should confirm an amendment to `docs/plan.md` for the renamed APIs.
- Build step 2 must choose its query layer: either `drizzle-orm@rc`'s `drizzle-orm/effect-d1`
  (exists, undocumented), or Drizzle for schema and migrations only, with `effect/sql`
  (`SqlSchema`) for queries.
- Several v4 modules are `@stability unstable` (`http`, `http-api`, `sql`, …) and may break in
  minor releases. Upgrades are therefore deliberate catalog edits; there are no ranges.
- The Vitest major is tied to the `@effect/vitest` major.
- `.claude/skills/effect-conventions/SKILL.md` and `.claude/rules/effect.md` still use v3
  names and must be updated (not part of S1-T1).

## Alternatives considered

- **Effect 3.22.3 + `@effect/vitest` 0.30.0 + Vitest 3.2.7**: matches the plan's names, but
  starts the project with migration debt, has no LTS statement, and holds Vitest back.
- **Mixing v4 core with v3 `@effect/sql-drizzle`**: impossible, because the peer ranges
  conflict.
