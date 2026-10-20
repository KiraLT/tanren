---
name: dispatch-observations
description: Measured facts about how subagent dispatch behaves in this repo (tool exposure, maxTurns calibration, role-file propagation lag, metric reliability) to reuse in retros
metadata:
  type: project
---

Measured on TOOL-1 (engineer/sonnet, 2026-10-20 22:51, first agent after the all-tools + disallowedTools switch):

- Subagents get 10 direct tools (Artifact, Bash, Edit, Read, Skill, ToolSearch, Write, SubagentHandback, advisor, placeholder); every MCP tool (context7, cloudflare docs, Claude Docs) and WebFetch is deferred behind `ToolSearch`. `Skill` is direct. So "MCP reachable" = yes, but only if the role text tells the agent to load it (engineer.md rule 3 now does).
- `maxTurns` counts API turns, not tool calls: 25 turns / 80 tool_use / 3m23s on sonnet ≈ 7 turns/min. 60 ≈ 8 min; set to 120 for a full 10–15/20-min box. Revisit after the first opus run reports its turn count.
- Role-file edits propagate with a lag of minutes: engineer.md edited 22:49:08, agent dispatched 22:51 still received the old text. Count a role-file failure only when the agent started ≥ ~5 min after the edit.
- The task-sheet "tool calls" number is hand-estimated and undercounts (42 logged vs 80 in the transcript). Retro metrics should come from the transcript jsonl under `~/.claude/projects/<project>/<session>/subagents/agent-<id>.jsonl` (count `tool_use` blocks; distinct assistant message ids = turns).

**Why:** retro arithmetic and "did the rule reach the agent" judgements were wrong twice before (S2-T3 timing, S6 researcher spawn) for lack of these facts.

**How to apply:** in Mode 2, pull tool counts and turn counts from transcripts, not from the Log; before blaming a role file, compare its mtime to the agent's first timestamp. See also [[retro-baseline]].
