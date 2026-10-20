# Step 1 — Monorepo scaffold, tooling, Effect setup, shared schemas
Source: docs/plan.md step 1 · Status: DONE (116 tests, approved, retro applied) · Updated: 2026-10-20

## Decisions
- ADR-0001 Record architecture decisions — accepted (architect, in progress)
- ADR-0002 Biome is the only formatter/linter; functional rules via GritQL plugins + self-test in the gate — accepted, written
- ADR-0003 TypeScript 7.0.2 (native `tsc`) — proposed (S1-T1 writes)
- ADR-0004 Effect 4.0.5 instead of the plan's Effect 3 names — **proposed, awaiting owner** (S1-T1 writes)
- ADR-0005 AI-first multi-agent development process — accepted (architect, in progress)

## Tasks
| id | title | role / model | depends on | files | status |
| --- | --- | --- | --- | --- | --- |
| S1-A | Data model design, ADR-0001/0005, task breakdown | architect / fable | — | docs/design/data-model.md, docs/adr/0001, 0005 | done |
| S1-T0 | Functional rules as Biome GritQL plugins | engineer / opus | — | .biome/*.grit, docs/research/…biome-functional-rules.md | done |
| S1-T1 | Monorepo scaffold + tooling + ADR-0003/0004 | engineer / opus | — | root configs, 4 package skeletons, .claude/skills/monorepo | done |
| S1-R0 | Toolchain versions fact sheet | researcher / sonnet | — | docs/research/2026-10-19-toolchain-versions.md | done |
| S1-R1a (paused until step 2/6; resumable) | Cloudflare core facts + skill | researcher / sonnet | — | docs/research/…cloudflare-core.md, skills/cloudflare-workers/SKILL.md | in-progress |
| S1-R1b (paused until step 2/6; resumable) | Better Auth + MCP facts + skill file | researcher / sonnet | — | docs/research/…cloudflare-auth-mcp.md, skills/cloudflare-workers/auth-and-mcp.md | in-progress |
| S1-R2a (paused until step 2/6; resumable) | Expo core facts + skill | researcher / sonnet | — | docs/research/…expo-core.md, skills/expo-mobile/SKILL.md | in-progress |
| S1-R2b (paused until step 2/6; resumable) | EAS/web/testing facts + skill file | researcher / sonnet | — | docs/research/…expo-updates-web-testing.md, skills/expo-mobile/updates-web-testing.md | in-progress |
| S1-R3 | Effect 4 API fact sheet | researcher / sonnet | — | docs/research/2026-10-19-effect-4-api.md | done |
| S1-T2a | Formatter style, `--error-on-warnings`, root tsconfig | engineer / opus (S1-T1 agent) | S1-T1 | biome.jsonc, package.json, tsconfig.json | done |
| S1-T2b | Register plugins + built-ins, plugin self-test in gate, HttpApiMiddleware allowlist, monorepo skill, ADR-0002 | engineer / opus (S1-T1 agent) | S1-T0, S1-T2a | biome.jsonc, .biome/, package.json, docs/adr/0002 | done |
| S1-T3 | shared foundation: ids, common, IdGenerator, barrel, stubs (design §4, §7.0) | engineer / opus | S1-A, S1-T1 | packages/shared/src/{ids,common,index}.ts + tests, stubs | done |
| S1-T4 | user + exercise + errors (design §5–§9) | engineer / opus | S1-T3 | src/{user,exercise,errors}.ts + tests | done |
| S1-T5 | plan + session (design §5–§8) | engineer / opus | S1-T3 | src/{plan,session}.ts + tests | done |
| S1-T7 | sync envelope (design §10) | engineer / opus (S1-T5 agent) | S1-T4, S1-T5 | src/sync.ts + tests | done |
| S1-T8 | review of T3/T4/T5 (overlapping T7), then sync.ts; reviewer runs the gate (replaces T6 + QA) | reviewer / opus | S1-T4, S1-T5 | packages/shared | done (APPROVE) |
| S1-T10 | skill truth-up: effect-conventions snippets ← real code (design §15) + compile-check | engineer / sonnet | S1-T7 | .claude/skills/effect-conventions | done |
| S1-T9 | Rewrite effect-conventions skill + effect rules for Effect 4 (compiled examples, scratchpad workbench) | engineer / opus | S1-R3 | .claude/skills/effect-conventions, .claude/rules/effect.md, tests.md | done |
| S1-REV | Review (review-fanout if diff > 400 lines) | reviewer / opus | all T | — | todo |
| S1-RETRO | Process retro | engineering-manager / opus | S1-T8 | docs/retro/2026-10-20-step-1.md | done |

## Done-criteria
### S1-T1 (closed 2026-10-19) — all met
- `pnpm check` green (biome ci · tsc 7.0.2 ×4 · vitest 5: 2 tests); `pnpm -F @tanren/shared test` green; lint proven to fail on `any` and `!`; ADR-0003/0004 written (proposed); monorepo skill rewritten.
- Ratified: `biome.jsonc` (comments needed), `vite 8.3.4` in catalog (vitest 5 peer), exact pins, `module: preserve`, vitest projects by glob.
- Carried to S1-T2: formatter style decision (Biome defaults = tabs + semicolons; switch to 2-space + `asNeeded`), `--error-on-warnings` on `biome ci`, root tsconfig covering `vitest.config.ts`, fix the "S1-T0" comment in biome.jsonc. Deferred: pnpm 12.14 upgrade + `packageManager` hash (step 2).
### S1-A (closed 2026-10-19) — all met
- docs/design/data-model.md (893 lines), ADR-0001/0005 accepted; breakdown adopted with renumbering (T2→T3 … QA stays S1-QA).
- Ratified by the Lead: `SyncChange` discriminated on `table`; `Insert` without `id` (server/device generate via IdGenerator); branded units; `ValidationError.issues`; soft delete = row with `deletedAt`; `WorkoutSet` + D1 tables `workout_session`/`workout_set`; `Profile.id = UserId`.
- Proposed to the owner (design §14): Q1 enum lists, Q2 opaque `SyncCursor` instead of `since: Option<Timestamp>` (clock-skew safe; Lead recommends yes), Q3 `weekStart` any weekday, Q4 bodyweight = `weightKg 0`, holds as `reps` seconds, Q5 no profile extras yet.
- Lead truth-ups owed (design §15): `.claude/rules/effect.md` discriminator wording; packages/db/CLAUDE.md table names + Better Auth UUID ids note.

### S1-T9 (closed 2026-10-19) — all met
- SKILL.md 350 lines, every ```ts block extracted and type-checked (tsc 7.0.2 exit 0); 40 workbench tests green; HttpApi snippet also run under Node (404/200/400).
- Ratified: `WorkoutSet` (not `Set`), `IdGenerator` service for UUIDs, `Schema.TaggedError` + `httpApiStatus` for domain/API errors, `X.makeEffect` in domain code, `Array as Arr` imports.
- Research-note gaps found (retro input): v4 `Random` has no UUID; `Schema.Class` constructors throw and `makeEffect` fails with `SchemaIssue.Issue`; spreading a Class instance loses the class; `D1Database` type reachable via `D1Client.D1ClientConfig["db"]`.
- Open (step 2/3 spike): per-request Worker `env` → `D1Client.layer`; Hermes `crypto.randomUUID`.
### S1-T0 (closed 2026-10-19) — all met
- Five plugins (noLet, noClass, noThrow, noMutation, noLoop) + built-ins noVar/noIncrementDecrement/noForIn; every positive sample flagged (8/9/3/24/5), every negative clean; adapter scoping and suppression ids verified; repo `biome ci` still exit 0.
- Ratified: camelCase plugin ids; Effect factory allowlist incl. HttpApi/HttpApiGroup `.make` chains (+ HttpApiMiddleware.Service added in S1-T2b); ambient `declare` skipped; PascalCase receivers skipped for array methods; `delete` via plugin.
- Retro input: the toolchain researcher's GritQL snippets had gaps (missed `for (let…)`, 5 assignment forms, `?.`/`["push"]`, class expressions) — researcher snippets must be treated as leads, engineers verify. Risk found: a broken plugin passes the gate silently → self-test added in S1-T2b.
See the briefs for the others (copied here when tasks close).

## Log (date · task · role/model · duration · tokens · tool uses · rounds · outcome)
- 2026-10-19 · (pre-step) Claude Code facts · claude-code-guide/inherit · 20m45s · 329k · 62 · 1 · done; too many questions for one agent (incident)
- 2026-10-19 · S1-R0 · researcher/sonnet(general-purpose) · 30m15s · 285k · 110 · 1 · done; scope changed mid-task (ESLint dropped); found Effect 4 + TS 7
- 2026-10-19 · nested-spawn test · general-purpose/haiku · 17s · 42k · 2 · 1 · NESTED-OK
- 2026-10-19 · S1-A, S1-T0, S1-T1, S1-R1a/b, S1-R2a/b dispatched in one message (after one failed round: agent types not yet registered)
- 2026-10-19 · S1-R3 dispatched; S1-A, S1-T0, S1-T1 redirected to Effect 4 / TS 7 via SendMessage
- 2026-10-19 · S1-R3 · researcher/sonnet · 4m21s · 138k · 35 · 1 · done; Effect 4 facts from tarball .d.ts (narrow brief → fast)
- 2026-10-19 · S1-T9 dispatched (engineer/opus) decoupled from S1-T1 via a scratchpad workbench
- 2026-10-19 · S1-T1 · engineer/opus · 17m51s · 223k · 75 · 1 · done, green; 5 mid-task redirects applied without re-dispatch (SendMessage worked well)
- 2026-10-19 · S1-T2a (formatter style, --error-on-warnings, root tsconfig) sent to the S1-T1 engineer via SendMessage; S1-T2b (plugin registration + ADR-0002) waits for S1-T0
- 2026-10-19 · S1-T2a · engineer/opus (resumed S1-T1 agent) · 1 round · done, green: 2-space/asNeeded formatter, `biome ci --error-on-warnings`, root tsconfig type-checks vitest.config.ts
- 2026-10-19 · S1-T9 · engineer/opus · 19m14s · 226k · 105 · 1 · done; decoupling from S1-T1 via workbench saved the wait
- 2026-10-19 · S1-T0 · engineer/opus · 33m55s · 350k · 116 · 1 · done; nudged once; thorough (sample matrix) but long — candidate for splitting next time
- 2026-10-19 · S1-T2b sent to the S1-T1 engineer via SendMessage
- 2026-10-19 · S1-A · architect/fable · 37m20s · 326k · 52 · 1 · done; nudged twice (incident)
- 2026-10-19 · S1-T3 dispatched (engineer/opus)
- 2026-10-19 · session 1 ended by owner request (token budget) with S1-T2b, S1-T3, S1-R1a/b, S1-R2a/b in flight; handoff + ready briefs written
- 2026-10-20 · rate limit (session 1 night) killed 6 agents mid-task; resumed S1-T3 and S1-T2b with 10-min time boxes; researchers paused; pipeline shortened (no T6/QA, single review)
- 2026-10-20 · S1-T3 · engineer/opus · resumed after rate limit, ~10 min box · done, 22 tests green; design §12 `uuidBrand`/`newId` bound did not compile (inline brands instead); no NonEmptyString (design §4 has none — ratified)
- 2026-10-20 · S1-T4 ∥ S1-T5 dispatched (engineer/opus, 15-min boxes)
- 2026-10-20 · S1-T2b · engineer/opus (resumed) · ~2 min after resume · done, green: `check` = check:plugins (11/11) → biome ci → typecheck → vitest; `let` proven to fail the gate; broken-plugin detection proven
- 2026-10-20 · S1-T5 · engineer/opus · 15-min box · done, 14 tests, green; S1-T7 sent to the same agent while S1-T4 finishes
- 2026-10-20 · S1-T4 · engineer/opus · 2m30s · 71k · 14 · 1 · done, 19 tests, green (wrote via Bash → format hook skipped; biome ci still enforces)
- 2026-10-20 · S1-T8 reviewer dispatched on T3/T4/T5 while T7 runs
- 2026-10-20 · S1-T7 · engineer/opus (resumed T5 agent) · ~5 min · done, 9 tests, 63 total green
- 2026-10-20 · S1-T10 dispatched (engineer/sonnet) parallel to the review
- 2026-10-20 · S1-T8 review part 1 (T3/T4/T5) · reviewer/opus · 1m44s · 73k · 12 · REQUEST CHANGES: 1 blocking (missing decode/round-trip tests for 6 entities), 4 should, 3 nit; design point: lenient Timestamp → Lead decided strict ISO w/ offset (common.ts, T4 agent)
- 2026-10-20 · S1-T8 review part 2 (sync) · reviewer/opus · 3m18s · 86k · 17 · APPROVE + 4 test additions → T5/T7 agent
- 2026-10-20 · fixes routed by SendMessage to the two owning engineers (no re-dispatch); step 2 design (architect/opus) and local-dev design (architect/opus) started in parallel = pipelining across steps
- 2026-10-20 · step-3 note: Patch ignores immutable parent keys at schema level; the worker boundary decides rejection (`onExcessProperty: "error"`) — carry to step 3 design
- 2026-10-20 · S1-T4 fix round · engineer/opus (resumed) · done: testing.ts helper, Equal round-trips, 20+ constraint cases, strict Timestamp (ISO with explicit offset; `Schema.decodeTo` + `SchemaTransformation.dateTimeUtcFromString`); 109 tests green
- 2026-10-20 · S1-T5/T7 fix round · engineer/opus (resumed) · 1m42s · done: entity round-trips, Patch-ignores-immutable-key pinned + doc comments, sync boundary/tombstone/mismatch tests, `satisfies`; 116 tests green
- 2026-10-20 · re-check (blocking only) sent to reviewer; S1-RETRO dispatched (engineering-manager/opus) in parallel
- 2026-10-20 · S1-T8 re-check · reviewer/opus · APPROVE; follow-up nit: move `wireRoundTrips` into src/testing.ts (next engineer touching shared)
- 2026-10-20 · S1-T10 · engineer/sonnet · 4m09s · 88k · 24 · skill aligned to real code (+ references/shared-examples.md); §4–9 snippets not recompiled → compile-check follow-up sent
- 2026-10-20 · local-dev design · architect/opus · done → docs/design/local-dev.md (proposed); Worker tests via @cloudflare/vitest-plugin (pool-workers lacks vitest 5 support)
- 2026-10-20 · S1-T10 compile-check · engineer/sonnet (resumed) · done: all §4–9 snippets compiled/ran via scratch test (deleted); 116 tests green
- 2026-10-20 · S1-RETRO · engineering-manager/opus · done; ratio ≈0.3 (s1) / 0.6 (s2); all 7 proposals applied by the Lead
