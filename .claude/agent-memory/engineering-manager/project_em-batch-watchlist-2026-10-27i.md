---
name: em-batch-watchlist-2026-10-27i
description: EM batch 15 (two production incidents BS-1 + white flash, HealthStrip rejection, Garmin copy, nutri teams) — items 80–85: untested failure-path claims, runFork build errors, after-paint captures, no reference app in designer briefs, copy truth, unowned stubs, Lead self-triage
metadata:
  type: project
---

Items 80–85 (2026-10-27, batch 15; metrics from transcripts: nutri-food TL 20.3 active / 53.1 span; nutri-today TL 35.3 / 74.6; N-M3 32.5 active over 3 rounds; spike BS-1 9.3; HOTFIX-1 12.2).

80. **Documented failure paths with no test** (BS-1): a hook comment claimed "Failed → allow" for the second-tab case; the real behaviour was a silent black screen for 5 days. Fixed where: rules/tests.md (failure-path claims), reviewer.md (failure-path claims). Watch: reviewers flag `should: untested failure path`; if the finding never appears, the rule is unread.
81. **`runFork` + in-program `catchCause` cannot see a runtime BUILD error**: fixed in code by HOTFIX-1/2 (`runCallback` + `runFailed`). Fixed where: rules/effect.md, expo-mobile skill, reviewer.md (blocking), apps/mobile/CLAUDE.md. Watch: `grep -rn runFork apps/mobile/src/hooks` should stay at useSync (background) only.
82. **After-paint captures hide frame defects** (white flash): 4 days of unthemed React Navigation containers in dark mode; no screenshot could show it. Fixed where: ui-check skill (mid-navigation ancestor-chain read + second-tab check), expo-mobile Design system (navigator theme bullet). Watch: the next dark capture set names the ancestor-chain check.
83. **Designer rounds without a reference app**: text-row stat strips passed v5 and v6 designer rounds (PASS 4/5); owner: "where is the designer? Did you see Apple Fitness?". Fixed where: architect.md screen checklist (stat surfaces), team-lead.md (designer brief names the reference). Watch: HM-D's spec and the next designer brief name Apple Fitness/Strava explicitly.
84. **Copy truth when a new reader is designed**: Garmin "never used by the AI planning tools" went false with nutrition MCP tools; nobody grepped `*Copy.ts`. Fixed where: architect.md + reviewer.md copy-truth checks. Also N-S4 (Amendment 24) widens MCP to everything — the copy must be re-checked once more at that task.
85. **Unowned stubs in foundation tasks** (seed.ts `foodEntry: Effect.void`, no daily_health rows) → "not driven by any agent" at team DONE. Fixed where: architect.md (stubbed foundations have an owner). Lead self-triage before the spike (5 min) → P-item (playbook). Watch: spike dispatch latency after the next owner-reported production symptom.

**Why:** three of the four owner complaints this batch were things no agent could see from its vantage (after-paint captures, a comment taken as fact, copy written before the reader existed). The system needs checks that read the frame, the claim and the copy, not only the diff.
**How to apply:** when a production incident lands, ask first "what claim did everyone trust?" and put the test or repro requirement next to that claim's home (rule/skill), then the review check.
