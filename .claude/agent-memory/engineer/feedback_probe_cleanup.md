---
name: probe-cleanup-no-rm-r
description: Briefs forbid `rm -r*` (permissions.ask); probe files must be single named files removed with plain `rm`, never probe directories
metadata:
  type: feedback
---

Never create a probe *directory* inside the repo; write single probe files with a distinctive
name (`zz-probe-*.svg`) and remove them with plain `rm <file>`.

**Why:** V2-I1 (2026-10-21) cleaned a probe dir with `rm -r`, which every brief lists under
"never run a command under permissions.ask"; it had to be confessed in the report.

**How to apply:** before any cleanup command, check it against the brief's permissions.ask list
(`git push|reset|checkout`, `rm -r*`, wrangler deploy/login/secret/d1 execute, `eas *`).
