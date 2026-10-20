---
name: gate
description: Run the quality gate (pnpm check — biome ci, typecheck, tests) from the repo root and summarise failures by package. Use when asked whether the build is green, before reporting a task done, or at session start.
---

# /gate

!`pnpm check 2>&1 | tail -n 150`

Summarise the output above: one line per failing package and check kind
(format / lint / typecheck / test), with the first error of each. If
everything passed, say so in one line with the counts. Do not fix anything
yourself; failures become briefs for an engineer.
