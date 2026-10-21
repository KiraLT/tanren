---
name: zsh-no-word-split
description: Bash tool runs zsh; A="agent-browser --session x"; $A fails (no word splitting) — use a wrapper script in $S; gate server start on the port probe
metadata:
  type: feedback
---

The Bash tool's shell is zsh: `A="agent-browser --session ui2a"; $A open …` runs a command literally
named "agent-browser --session ui2a" (not found). Write `$S/<task>-ab.sh` (`exec agent-browser --session <task> "$@"`) and call it.

**Why:** UI-2a lost one round trip to this; in the same session a port probe and `expo start` sat in one
compound command, so expo started against a busy port (it exited cleanly, but only by luck).

**How to apply:** for any multi-word command variable use a wrapper script or a function; make the
dev-server start conditional on the probe (`… || (start)`), or probe in a separate call first. See [[feedback_port_probe]].
