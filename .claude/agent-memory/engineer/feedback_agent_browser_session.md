---
name: agent-browser-own-session
description: agent-browser without --session shares one default browser with other agents; always pass --session <task>
metadata:
  type: feedback
---

Always run agent-browser as `agent-browser --session <task-id> …` (open, set viewport, screenshot, close).

**Why:** IMG-3 (2026-10-21) ran `open file://…contact.html` + `screenshot` on the default session and got another agent's Today screen; the following `close` may have closed their page.

**How to apply:** every agent-browser call in company mode; never `close --all`. Also in zsh, `for i in $list` does not word-split: write the items inline. See [[probe-ports-curl-ps]].
