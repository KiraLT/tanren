---
name: port-probe-ps-not-lsof
description: lsof/netstat miss other agents' wrangler listeners here; probe ports with curl and ps, and give every wrangler its own --inspector-port
metadata:
  type: feedback
---

Before taking a port, check with `curl --max-time 2 localhost:<p>` and `ps -ef | grep "port <p>"`, not only `lsof -tiTCP:<p>`.

**Why:** INT-X1b (2026-10-21): `lsof` and `netstat` printed nothing for 8795/8793 while two orphaned wranglers from other agents (MM, illshrink) served them; my wrangler died "Address already in use" and curl silently hit theirs (stale bundle, wrong `MCP_RESOURCE_URL`), which looked like a product bug. Two wranglers started together also collide on the default inspector port 9229.

**How to apply:** pick ports nobody's `ps` command line names, pass `--inspector-port` to every wrangler, and confirm `Ready on http://localhost:<p>` in your own log before probing. Stop only processes whose command line carries your unique port. See [[no-rm-r-probe-cleanup]].
