---
name: adr
description: Lead-only. Record an architecture decision — spawn the architect to write docs/adr/NNNN-<slug>.md with Status, Context, Decision, Consequences, Alternatives. Use when a decision was made that the plan does not cover, or the owner asks to document one.
argument-hint: <title> [— context]
---

# /adr $ARGUMENTS

Existing ADRs:
!`ls docs/adr 2>/dev/null || echo "(none)"`

1. Spawn the `architect` (model `fable`; `sonnet` if the decision is already
   made and only needs recording) with: the title, the context (who decided,
   when, why), the options considered, and whether the owner has confirmed
   it (`accepted`) or not (`proposed`).
2. The architect writes the ADR with the next free number and returns its
   path. Link it from the current task sheet under "Decisions".
3. If `proposed`, list it under "Decisions for the owner" in your next
   message and in `docs/handoff.md`.
