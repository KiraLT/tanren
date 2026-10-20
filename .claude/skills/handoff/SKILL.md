---
name: handoff
description: Lead-only. Rewrite docs/handoff.md so a cold session can resume without this transcript — state, verified facts, next actions, decisions for the owner. Use at the end of every session or when the owner says "handoff", "wrap up", or "save state".
---

# /handoff

Working tree:
!`git status --short | head -40`

Task sheets:
!`ls docs/tasks 2>/dev/null`

Rewrite `docs/handoff.md` completely (it is state, not a log) with:

```
# Handoff — YYYY-MM-DD

## Where we are
<current build step, which tasks are done / in review / blocked, one paragraph>

## Verified
- <fact with the command or test that proves it>

## Not verified / known broken
- <…>

## Next actions (in order)
1. <next brief to write, or next task to dispatch>

## Decisions for the owner
- ADR-NNNN <title> (proposed) — <one line>

## Gotchas learned this session
- <anything a fresh agent would trip over>
```

Keep it under 80 lines. Then tell the owner it is written.
