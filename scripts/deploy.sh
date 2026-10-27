#!/bin/zsh
# Production deploy from a clean worktree of HEAD (docs/design/deploy.md recipe; owner lifted the deploy ban for the Lead, dev-system §13).
set -euo pipefail
R=${0:A:h:h}
S=${DEPLOY_DIR:-$R/.deploy}
mkdir -p "$S"
cd "$R"
HEAD=$(git rev-parse --short HEAD)
echo "== deploy of $HEAD starting $(date '+%H:%M:%S')"
git worktree remove --force "$S/deploy-wt" 2>/dev/null || true
git worktree prune
git worktree add --detach "$S/deploy-wt" HEAD
cd "$S/deploy-wt"
echo "== install $(date '+%H:%M:%S')"
pnpm install --frozen-lockfile >"$S/deploy-install.log" 2>&1 || { tail -30 "$S/deploy-install.log"; exit 2; }
echo "== gate $(date '+%H:%M:%S')"
pnpm check >"$S/deploy-check.log" 2>&1 || { echo "GATE RED"; grep -n "FAIL\|error TS\|✗\|×" "$S/deploy-check.log" | head -30; tail -40 "$S/deploy-check.log"; exit 3; }
tail -6 "$S/deploy-check.log"
echo "== export web $(date '+%H:%M:%S')"
EXPO_PUBLIC_API_URL=https://api.tanren.me CI=1 pnpm -F @tanren/mobile export:web >"$S/deploy-export.log" 2>&1 || { tail -30 "$S/deploy-export.log"; exit 4; }
ls apps/mobile/dist | head -5
echo "== deploy worker $(date '+%H:%M:%S')"
cd apps/worker
# MIGRATE=1: apply new D1 migrations to production first (docs/design/deploy.md:125); the worker must not run ahead of its schema.
if [ "${MIGRATE:-0}" = "1" ]; then echo "== d1 migrations $(date "+%H:%M:%S")"; pnpm exec wrangler d1 migrations apply tanren --env production --remote 2>&1 | tail -12; fi
# isolated linker: the binary is apps/worker/node_modules/.bin/wrangler → pnpm exec. The cron trigger
# step fails with 10063 until the account has a workers.dev subdomain; the script itself still deploys.
pnpm exec wrangler deploy --env production 2>&1 | tail -15 || echo "worker deploy returned non-zero (cron trigger pending workers.dev subdomain?) — continuing"
echo "== deploy web $(date '+%H:%M:%S')"
pnpm exec wrangler deploy -c wrangler.web.jsonc --env production 2>&1 | tail -12
echo "== checks $(date '+%H:%M:%S')"
curl -sS --max-time 20 --resolve api.tanren.me:443:104.21.69.164 https://api.tanren.me/health; echo
curl -sSI --max-time 20 --resolve tanren.me:443:104.21.69.164 https://tanren.me/ | head -4
curl -sS --max-time 20 --resolve tanren.me:443:104.21.69.164 https://tanren.me/ | grep -o '<title>[^<]*</title>' | head -1
echo "== done $HEAD $(date '+%H:%M:%S')"
