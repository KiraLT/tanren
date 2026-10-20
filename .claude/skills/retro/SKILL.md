---
name: retro
description: Lead-only. Run the process retrospective for a build step or task group — spawn the engineering-manager with the dispatch metrics, apply the accepted edits to CLAUDE.md / .claude files, log what changed. Use at the end of every step, after an incident, or when the owner asks how to make the team faster.
argument-hint: <step-number or topic>
---

# /retro $ARGUMENTS

Incidents so far:
!`tail -n 20 docs/retro/incidents.md 2>/dev/null || echo "(none logged)"`

Task sheet log:
!`sed -n '/^## Log/,$p' docs/tasks/step-$ARGUMENTS.md 2>/dev/null | head -60`

## Steps

1. Assemble the dispatch summary from the task sheet Log and the task
   notifications you received: per dispatch — task, role, model, duration,
   tokens, tool uses, review rounds, outcome, and any blocked tool calls.
   Also pass the transcript directory (`<session scratch>/tasks/*.output`,
   one JSON per line, nested team agents included): the EM takes duration
   (first→last `timestamp`), turns (distinct assistant `message.id`), tool
   uses (`tool_use` blocks) and tokens (`message.usage`, deduped per message
   id; the notification's "k" ≈ cache_creation + input + output) from there,
   never from the Log — step 2's Log said S2-T3 ran ~24 min; the transcript
   showed 5m42s. Transcript timestamps are UTC; the Log is the owner's local
   clock (Europe/Vilnius, UTC+3 until the last Sunday of October): convert
   before comparing, and trust transcript times over remembered ones (retro
   4 ∥ 7: "fan-out 23:14" was 23:16:44, "owner nudge 23:40" was ≈ 23:32).
   An engineer's span includes its wait for the fix round: report active
   time (dispatch/resume → hand-back) and the fix-round wait separately;
   the 20-min rule is on active time.
2. Spawn the `engineering-manager` (model `fable`, `effort: max`) with that
   summary, the paths above, and the question "what would have made this
   step faster and smoother, and what should change in the system?"
3. Read `docs/retro/<date>-step-$ARGUMENTS.md`. Ownership is split: the EM
   has already applied its edits to `.claude/skills`, `.claude/rules`,
   `.claude/agents` (not its own file) and package `CLAUDE.md`s. The rest
   are proposals for you: for each, accept, adapt, or reject with one line
   why, and apply the accepted ones to `.claude/settings.json`,
   `.claude/hooks`, `docs/dev-system.md`, root `CLAUDE.md` and
   `.claude/agents/engineering-manager.md` (ADR if roles or the gate change).
4. Append one line per applied change to `docs/retro/incidents.md`
   ("fixed where" column) and record the experiment for the next step in
   `docs/handoff.md`.
5. If the retro says "Escalate to research", spawn one `spike` (`opus`,
   ≤ 10 min) on one specific question about external multi-agent practice,
   and file the answer under `docs/research/process-*.md`.
6. Tell the owner: metrics, the top waste, what changed, the next experiment.
