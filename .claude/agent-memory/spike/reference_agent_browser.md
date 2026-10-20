---
name: agent-browser-ui-check
description: agent-browser (vercel-labs) can drive the Tanren Expo web app headless; gotchas for zsh, offline mode, and Expo dev server
metadata:
  type: reference
---

Verified on 2026-10-20 with agent-browser 0.39.1. Full notes are in docs/research/2026-10-20-agent-browser.md.

- Chrome for Testing is stored in `~/.agent-browser/browsers/` (about 360 MB per version, shared across projects). Older versions may already be there.
- zsh doesn't word-split `$AB`. Wrap the CLI in a shell function instead.
- Offline emulation is `agent-browser set offline on`. There is no top-level `offline` command.
- Reloading while offline fails (chrome-error) because the Expo dev server serves the bundle and the app has no service worker. Test offline as: offline on → act → offline off → reload → assert.
- Start Expo with `CI=1 pnpm -F @tanren/mobile web --port 8089`, then kill only that PID (find it with lsof on 8089).
