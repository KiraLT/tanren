# Research: what can we install instead of building? (2026-10-20)

Question (owner): are we reinventing things that exist as Claude Code plugins, skills, agents,
hooks or MCP servers? Time box 15 min. Nothing was installed or changed.

Method: read our system (`CLAUDE.md`, `docs/dev-system.md`, `.claude/agents|skills|workflows|hooks`,
`.claude/settings.json`); read the local marketplace cache
(`~/.claude/plugins/marketplaces/claude-plugins-official`, 315 entries in `marketplace.json`,
38 Anthropic-built under `plugins/`, synced 2026-10-20); web search; `npm view` for versions.
Labels: **V** = verified (file read, command run, or vendor page fetched today) ·
**INF** = inferred.

Install syntax (V, Expo docs): `claude plugin install <name>@claude-plugins-official --scope project`.

## 1. Stack vendors (domain knowledge)

| Candidate | Source | Ships | Ours it touches | Verdict | Why |
|---|---|---|---|---|---|
| **cloudflare** | official marketplace → `cloudflare/skills` (pinned sha) | 19 skills incl. `wrangler`, `workers-best-practices`, `agents-sdk`, `durable-objects`, `web-perf`; MCP `cloudflare` = Code Mode API server `mcp.cloudflare.com/mcp` (`search/execute/docs`, OAuth) (V) | `.claude/skills/cloudflare-workers/SKILL.md` (a stub) | **adopt now** (step 3–5 ahead) | Vendor-maintained Wrangler/D1/Agents SDK/McpAgent knowledge; our skill keeps only Tanren deltas. The API MCP can change the account and gets around our `ask` rules for `wrangler deploy` / `d1 execute`, so give it read-only OAuth scopes or put its `execute` tool under `ask` (exact tool name: VERIFY after install) |
| **expo** | official marketplace → `expo/skills` | 24 skills (`expo-router`, `expo-project-structure`, `expo-data-fetching`, `eas-update`, `expo-upgrade`, `expo-design-system`, …) + remote Expo MCP (docs, EAS, local simulator on SDK 54+, needs an Expo account login via `/mcp`) (V) | `.claude/skills/expo-mobile/SKILL.md` (stub) | **adopt at step 6** | Matches our SDK 58 (Expo's examples use `default@sdk-58`). No skill for expo-sqlite, monorepos or Workers-hosted web export (V), so those stay in our skill. Ignore `eas-hosting` (we host on Workers) |
| Better Auth docs MCP | `mcp.better-auth.com/mcp`, `npx auth@latest mcp --claude-code` (V) | docs search MCP | context7 | **skip** (try at step 3 only if context7 is stale) | context7 already serves library docs; there is no official skill |
| effect-mcp (tim-smart) | npm `effect-mcp` 0.1.16, last publish 2025-10-06 (V) | Effect docs MCP | `effect-conventions` | **skip** | A year stale, from the Effect 3 era |
| effect-solutions | npm 0.5.3, 2026-04-29 (V) | pattern CLI for agents | `effect-conventions` | **skip** | Imports `@effect/platform` (Effect 3 layout); conflicts with ADR-0004 |
| Community Effect skills (skills.sh, claudemarketplaces) | various | SKILL.md files | `effect-conventions` | **skip** | Unvetted and mostly Effect 3. Our 350-line verified Effect 4.0.5 skill has no maintained equivalent |
| `@effect/tsgo` | npm 0.55.0, published 2026-10-20 (V) | Effect language service for TS 7 (diagnostics) | gate / `monorepo` skill (already marked "optional, not installed") | **try** (engineer brief + ADR) | Not a Claude plugin, but it could catch Effect mistakes (e.g. floating Effects) in the gate. Check first that it has a CLI or diagnostics mode |
| typescript-lsp (official) | `plugins/typescript-lsp` → `typescript-language-server` 6.0.2 (V) | LSP | none | **skip** | Wraps tsserver's JS API, which TS 7.0.2 does not ship (`node_modules/typescript/lib` holds only `tsc.js`; ADR-0003) (V) |
| Custom TS 7 LSP plugin | ours, ~10 lines of `lspServers` | LSP via `tsc --lsp --stdio` | none | **try later** | TS 7.0.2 accepts `--lsp --stdio` (no unknown-option error, unlike a bogus flag) (V). Not tested end to end |
| Biome MCP / LSP plugin | none found (search) | — | `.claude/hooks/format.sh` | **skip, keep ours** | No Biome plugin exists. Our PostToolUse hook is the standard pattern (Anthropic's `claude-code-setup` recommends exactly this) |

## 2. Anthropic-built plugins (official marketplace)

| Plugin | Ships (V, read locally) | Ours it overlaps | Verdict | Why |
|---|---|---|---|---|
| **session-report** | skill + `analyze-sessions.mjs`: tokens, cache breaks, `by_subagent_type`, `by_skill`, top prompts from `~/.claude/projects` | dispatch metrics the Lead hand-logs for `/retro` (dev-system §12) | **try now** | Cheap and read-only; could give `/retro` its token/agent numbers without hand logging |
| **mcp-server-dev** | skills `build-mcp-server`, `build-mcp-app`, `build-mcpb` (tool design, auth, remote HTTP) | architect at steps 4–5 | **try at step 4** | Tool-design guidance for `get_overview`… `write_plan_week`; complements cloudflare `agents-sdk` |
| playwright (owner decision 2026-10-20: not needed) (external) / chrome-devtools-mcp | browser MCP | `qa` agent at step 7 | **try at step 7** | Lets QA check the responsive two-column web layout; nothing needed before then |
| security-guidance | hooks: regex warnings on edit, an **LLM diff review on every Stop**, an agentic review on `git commit`; needs Python | `reviewer`, `review-fanout.js` (no security dimension) | **skip plugin** | A model call on every agent turn costs too much and adds latency. Use the built-in `/security-review` on the auth diffs at steps 3 and 5 |
| claude-md-management | skill `claude-md-improver` (audit) + `/revise-claude-md` | `engineering-manager`, `em-review` | **try once** as an audit, do not keep | A second writer to CLAUDE.md would race the EM. A one-off audit is worth running because CLAUDE.md has drifted (§4) |
| hookify | `/hookify`, Python hooks for Pre/PostToolUse/Stop/Prompt, rules in `.claude/hookify.*.local.md` | `.claude/hooks/format.sh`, Biome GritQL plugins | **skip** | We have one hook; the hard rules are already checked on every write by Biome plugins. Adds Python, and its rule files are named `.local` (per user, not team-shared) |
| pr-review-toolkit | 6 agents: code-reviewer, silent-failure-hunter, type-design-analyzer, pr-test-analyzer, comment-analyzer, code-simplifier | `reviewer`, `review-fanout.js` dimensions | **skip** (optionally borrow ideas) | Not Effect-aware (silent-failure-hunter looks for try/catch, which does not apply under no-throw). `type-design-analyzer` could become a review-fanout dimension |
| code-review | `/code-review`: 4 parallel agents on a GitHub PR, CLAUDE.md compliance, confidence scoring | `review-fanout.js` | **skip** | Built around PRs; we have no remote or PRs. Ours already adds adversarial verification |
| feature-dev | agents code-explorer / code-architect / code-reviewer + 7-phase `/feature-dev` | `architect`, `engineer`, `reviewer`, `build-step` | **skip** | Duplicates our pipeline without the hard rules or time boxes |
| code-simplifier | 1 agent | built-in `/simplify` | **skip** | Duplicate |
| claude-code-setup | read-only automation recommender | this note | **skip** | This research covers the same ground |
| ralph-loop | while-true loop via Stop hook | — | **skip** | Conflicts with time-boxed agents |
| agent-sdk-dev, LSPs for other languages, output styles, math, cwc | — | — | **skip** | Not our stack |

## 3. Process and orchestration

| Candidate | What | Ours | Verdict | Why |
|---|---|---|---|---|
| Native **agent teams** (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`) | shared task list, mailboxes, `TeammateIdle`/`TaskCompleted` hooks (V, code.claude.com) | `team-build.js`, `team-lead.md`, dev-system §11 | **skip for builds** | Experimental. **No nested teams** (our team-lead spawns engineers). Agent-definition `skills:` are **not applied** to teammates (engineer.md preloads two). No resume, interactive only. Enabling it also turns named subagents into teammates (V) |
| superpowers 7.0.0 (installed) | 14 skills + a **SessionStart hook** that injects `using-superpowers` ("MUST invoke a skill before ANY response") on startup/clear/compact (V) | `lead-playbook`, `plan-step`, `build-step`, `review` overlap with its brainstorming / writing-plans / subagent-driven-development / requesting-code-review | **keep, watch** | Engineers use only TDD, systematic-debugging and verification-before-completion (engineer.md:55). The hook pushes the Lead toward superpowers' own flows; log any detour as an incident and let the retro decide |
| mattpocock-skills | 28 skills: `retro`, `handoff`, `research`, `tdd`, `code-review`, `to-tickets`, `implement-spec`, `grill-me`, `writing-for-agents` (V) | most of `.claude/skills` | **skip** | A second full methodology on top of superpowers; its names collide with our `retro`/`handoff` and it assumes an issue tracker. `writing-for-agents` is worth reading for the EM |
| "Self-improving agent" plugins (claudepluginhub, 3 near-identical publishers) | memory → CLAUDE.md promotion | `engineering-manager` | **skip** | Unvetted forks; the EM already does this with evidence |
| context7, frontend-design (installed) | docs MCP; UI design skill | spikes, step 6–7 | **keep** | context7 overlaps the vendor doc MCPs above, which is acceptable |

## 4. Side findings (for the Lead)

- `CLAUDE.md` says "A hook enforces this" (Lead writes no code), but `docs/dev-system.md` §5 says
  the guard hook was removed, and `.claude/settings.json` has only the format hook (V).
- `CLAUDE.md` lists the roles `researcher` and `process-observer`; `.claude/agents/` has neither
  (it has `spike` and `engineering-manager`) (V). This brief asked for a researcher.
- `review-fanout.js` has 5 dimensions (hard-rules, effect-idioms, correctness, brief-and-tests,
  boundaries) and **no security dimension**. That matters for steps 3 and 5 (magic link, OAuth).

## 5. Recommendation

1. **Install now** (project scope): `cloudflare` and `session-report`. Install `expo` at step 6,
   `mcp-server-dev` at step 4, and playwright (owner decision 2026-10-20: not needed) at step 7 for QA.
2. Give the Cloudflare API MCP read-only scopes, or put its `execute` tool under `permissions.ask`.
   Otherwise it gets around our `ask` rules for `wrangler deploy` and `d1 execute`.
3. **Trim, don't drop**: `cloudflare-workers` and `expo-mobile` stay, but only for Tanren-specific
   verified facts (Effect D1 layer, vitest in workerd, McpAgent boundary, expo-sqlite sync, hooks
   boundary, web export on Workers). Generic Wrangler, Expo Router and EAS content goes to the
   vendor skills. Add to dev-system §11b: "vendor skill for generic, ours for deltas, ours wins".
4. **Keep custom** (nothing maintained replaces them): `effect-conventions` (Effect 4 only;
   community and MCP options are Effect 3 or stale), `monorepo` + `format.sh` + `.biome/` (no
   Biome plugin exists), the Lead/EM/retro/handoff/plan/build skills and `review-fanout.js` /
   `team-build.js`. Native agent teams cannot nest, do not apply agent skills to teammates, and
   are experimental.
5. **Skip**: hookify, feature-dev, code-review, pr-review-toolkit, code-simplifier,
   mattpocock-skills, typescript-lsp (incompatible with TS 7), security-guidance (Stop-hook cost).
   Instead, run the built-in `/security-review` on auth diffs at steps 3 and 5.
6. **Try via brief**: `@effect/tsgo` in the gate (ADR), and a 10-line TS 7 LSP plugin using
   `tsc --lsp --stdio`.
