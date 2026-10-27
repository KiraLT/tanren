---
name: watch-symlink-mtime
description: tasks/<id>.output are symlinks to subagents/*.jsonl — silence checks must use `stat -L -f %m`, or every child looks stalled
metadata:
  type: feedback
---

Child transcripts under `<scratchpad>/../tasks/<id>.output` are symlinks to
`~/.claude/projects/<proj>/<session>/subagents/agent-<id>.jsonl`. `stat -f %m` returns the
symlink's own mtime (dispatch time), so a watchdog reads "silent 476 s" for a child that is
writing every second. Use `stat -L -f %m` in every until-loop / mtime watchdog.

**Why:** v6b programs (2026-10-27 16:29): three live resumed children all looked stalled for
8 min; `ls -lt tasks/` showed the symlinks, `stat -L` showed 0–21 s.

**How to apply:** the team-lead.md loop shape `stat -f %m $F` → `stat -L -f %m $F`; count
hand-backs with `grep -c SubagentHandback` against a baseline taken before each resume
(a resumed child appends to the same file). Related: [[resume-nonblocking]].
