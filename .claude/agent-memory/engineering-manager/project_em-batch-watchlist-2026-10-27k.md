---
name: em-batch-watchlist-2026-10-27k
description: Retro v6 (2026-10-27 13:30→17:11; 107 agents, 975 active min, peak 19 live) — items 91–96: commit-as-gate holds 77 stream-min (3 occurrences in one step), HM set shipped with no code reviewer, direction sheet before any owner-visible build, reload windows = no writer mid-edit, connector tool count as deploy check, long-resume sonnet engineers at 55 M cache-read
metadata:
  type: project
---

Items 91–96 (retro `docs/retro/2026-10-27-v6.md`):

91. **Commit-as-gate repeated three times in one step** (nutrition 38 min, Garmin 22, programs 17 = 77 stream-min) although the playbook fix landed mid-step (14:47). Watch: next multi-team step has 0 commit-gated idle minutes (experiment "zero commit-gated idle"); if it recurs → escalate: the sheet template itself must carry the FILE condition per hand-off (architect.md has the rule; check the next sheet's Order section literally says "when <files> are final").
92. **No code reviewer on a task set** (HM-1…3 → DEPLOY-17 with designer + QA only). Fixed where: architect.md sheet rule; P4 playbook. Watch: every briefs file in `docs/tasks/*-briefs.md` has an R line; grep `reviewer` in the next one before judging it.
93. **Direction sheet before the build** is now the architect's rule for owner-visible surfaces (HM-D 6.5 min is the template). Watch: the next new card/strip/page shows gallery directions BEFORE its engineer dispatch; a surface dispatched straight to an engineer = finding.
94. **Reload windows**: ruled "no writer mid-edit, hourly, bold, ≤ 3-min hold" — never "after every deploy" (deploys ran with 5–8 live agents). engineer.md `resume after a kill` exists. Watch: the next owner reload kills 0 writers; killed writers are re-dispatched with that marker.
95. **Connector tool count as a deploy check** (23 = MCP_TOOLS.length after DEPLOY-17, no agent). Proposed P6; watch the next MCP deploy's verification line names the count from the connector.
96. **Long-resume sonnet engineers**: P-M3 one agent, 186 turns, 64 min span, 55 M cache-read over 3 rounds; P-S2+N-S4 127 turns / 33 M. Wall-clock unaffected (owner's metric) — token note only; if the owner ever asks about cost, propose "fresh agent after the 2nd fix round".

**Why:** the step's long poles were programs (155 min, scope adds absorbed) and nutrition (150, 38 min of it a gate). Every minute lost on the critical path came from a wait on a commit or from a text that disagreed with another text; agents themselves ran at 8–12 active min per opus task.
**How to apply:** at the next retro compute commit-gated idle per stream first; if > 0, the fix is in the sheet's Order wording, not in the Lead's playbook (which already has it).
