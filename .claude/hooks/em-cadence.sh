#!/bin/sh
# Kaizen guard (owner, 2026-10-26: "think how to ensure that similar things wont happen").
# PostToolUse on Bash: after every `git commit`, count the commits since the Engineering
# Manager last wrote docs/retro/em-log.md and nag the Lead when the loop is overdue.
# Stop: same check before the Lead ends a turn. Output goes back into the Lead's context.
set -eu
ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$ROOT" 2>/dev/null || exit 0
[ -d .git ] || exit 0
MODE="${1:-post}"
if [ "$MODE" = "post" ]; then
  INPUT=$(cat 2>/dev/null || true)
  case "$INPUT" in
    *"git commit"*) ;;
    *) exit 0 ;;
  esac
fi
LIMIT="${EM_CADENCE_LIMIT:-4}"
LAST=$(git log -1 --format=%H -- docs/retro/em-log.md 2>/dev/null || true)
if [ -z "$LAST" ]; then
  echo "EM cadence: docs/retro/em-log.md has no commits yet; run /em-review after the next accepted batch."
  exit 0
fi
N=$(git rev-list --count "$LAST"..HEAD 2>/dev/null || echo 0)
if [ "$N" -ge "$LIMIT" ]; then
  echo "EM cadence OVERDUE: $N commits since the last Engineering Manager entry (limit $LIMIT). Dispatch the engineering-manager (fable, background) with the accepted reports before any new dispatch, then log it in docs/retro/em-log.md."
elif [ "$MODE" = "stop" ] && [ "$N" -ge 2 ]; then
  echo "EM cadence: $N commits since the last EM entry; plan the EM pass at the next accepted batch."
fi
exit 0
