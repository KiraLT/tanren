---
name: dispatch-observations
description: Measured facts about how subagent dispatch behaves in this repo (tool exposure, maxTurns calibration, role-file propagation lag, metric reliability, where transcripts live, Lead latency pattern) to reuse in retros
metadata:
  type: project
---

Measured on TOOL-1 (engineer/sonnet, 2026-10-20 22:51, first agent after the all-tools + disallowedTools switch):

- Subagents get 10 direct tools (Artifact, Bash, Edit, Read, Skill, ToolSearch, Write, SubagentHandback, advisor, placeholder); every MCP tool (context7, cloudflare docs, Claude Docs) and WebFetch is deferred behind `ToolSearch`. `Skill` is direct. So "MCP reachable" = yes, but only if the role text tells the agent to load it (engineer.md rule 3 now does).
- INT-2b (engineer/opus, 5m36s): 35 turns / 38 tool_use (≈6 turns/min on opus); `Skill` was called (ui-check) so skills ARE reachable. context7 first used by subagents at 23:03 on 2026-10-20 — two fable architects (2 resolve-library-id + 3 query-docs; cloudflare docs ×2). Engineers: 0 context7 calls across ~20 runs; the "verify via context7" rule is still unexercised for them.
- `maxTurns` counts API turns, not tool calls: 25 turns / 80 tool_use / 3m23s on sonnet ≈ 7 turns/min. 60 ≈ 8 min; set to 120 for a full 10–15/20-min box.
- Role-file edits propagate with a lag of minutes: engineer.md edited 22:49:08, agent dispatched 22:51 still received the old text. Count a role-file failure only when the agent started ≥ ~5 min after the edit.
- Metrics source: `<session scratch>/tasks/<agentId>.output` (symlinks to `~/.claude/projects/<project>/<session>/subagents/agent-<id>.jsonl`), nested team agents included. Per agent: duration = first→last `timestamp`; turns = distinct assistant `message.id`; tool uses = `tool_use` blocks; tokens = `message.usage` deduped per message id. The Lead's notification "k" ≈ cache_creation + input + output (uncached), ≈ 5% of context processed (step 2: 3.9M uncached of 71.6M). Hand counts in the Log undercount tool uses ~2× and durations written from memory were wrong (S2-T3 "~24 min" = 5m42s).
- Lead latency pattern (step 2): dependent dispatch < 1 min while ≥ 2 streams ran; 8.2 min dispatch lag + 5.7 min acceptance lag once a single agent was the whole team (the Lead did maintenance in between). Measure both lags per critical-path edge in every retro.
- Team-lead overhead: 2.3–3.4 min from spawn to first engineer (sheet writing); each team-lead handed back twice (interim + final).

**Why:** retro arithmetic and "did the rule reach the agent" judgements were wrong twice before (S2-T3 timing, S6 researcher spawn) for lack of these facts.

**How to apply:** in Mode 2, write a ~30-line node script in the scratchpad that folds the jsonl per agent as above (done 2026-10-20, ~1 min); before blaming a role file, compare its mtime to the agent's first timestamp. See also [[retro-baseline]].
