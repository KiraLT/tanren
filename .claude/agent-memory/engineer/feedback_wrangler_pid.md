---
name: wrangler-pid-wrapper
description: Backgrounded `pnpm exec wrangler dev` records the pnpm JS shim PID; killing it orphans pnpm-native + wrangler still holding the port
metadata:
  type: feedback
---
`( pnpm exec wrangler dev --port N … & echo $! > pidfile )` records the pnpm shim; `kill` on it leaves
`pnpm-native exec wrangler …` (reparented to 1) and wrangler alive on port N (EQ-1, 2026-10-21, twice).

**Why:** pnpm 12 shim spawns `pnpm-native`, which spawns wrangler; SIGTERM to the shim is not forwarded.

**How to apply:** after `kill $(cat pidfile)`, run `ps -ef | grep "port N"`; if the pnpm-native line remains,
write that PID into the same pidfile and kill it (it forwards to wrangler). Better: start with
`node_modules/.bin/wrangler dev …` directly so `$!` is wrangler. Related: [[port-probe]].
