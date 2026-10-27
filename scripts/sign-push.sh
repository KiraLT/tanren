#!/bin/zsh
# SSH-sign every commit that is not yet on origin/main, then push. Commits in this repo are made
# unsigned (commit.gpgsign=false, local config) so agents never wait on 1Password; the owner runs
# this once per push and unlocks 1Password once.
#
# The signing rebase runs in a DETACHED WORKTREE of HEAD, so the real index and working tree (which
# other agents keep dirty) are never touched. `rebase --exec 'commit --amend -S'` re-creates each
# commit with a signature, same tree and message; the real `main` is then moved to the new tip with
# `update-ref` (old-value guard: it fails if main moved meanwhile). Because the new tip has exactly
# the old tip's tree, the real index and working tree stay consistent with the new HEAD, and
# `git status` is identical before and after.
#
# Flags (git 2.54, `git help rebase`): `-x/--exec <cmd>` appends `exec <cmd>` after every picked
# commit and implies --empty=keep; `commit --amend --no-edit -S` keeps the message and signs
# (`--allow-empty` so an empty commit can be amended too).
# If the script is killed hard (kill -9) and leaves a stale worktree entry, `git worktree prune`
# recovers.
set -euo pipefail

R=${0:A:h:h}
cd "$R"

BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || true)
[ "$BRANCH" = "main" ] || { echo "sign-push: not on main (on '${BRANCH:-detached HEAD}')"; exit 2; }

git fetch origin
git rev-parse --verify -q origin/main >/dev/null || { echo "sign-push: origin/main not found"; exit 2; }

# Read the tip once: every later count and check uses OLD, so a commit made while the script runs
# (the Lead keeps committing) cannot trip the count check.
OLD=$(git rev-parse HEAD)
git merge-base --is-ancestor origin/main "$OLD" || { echo "sign-push: main has diverged; pull first"; exit 2; }

UNPUSHED=$(git rev-list --count origin/main.."$OLD")
if [ "$UNPUSHED" -eq 0 ]; then
  echo "nothing to push"
  exit 0
fi
# A rebase flattens merges; refuse rather than silently rewrite history shape.
if [ "$(git rev-list --count --merges origin/main.."$OLD")" -ne 0 ]; then
  echo "sign-push: unpushed merge commits cannot be re-signed by rebase"
  exit 2
fi

echo "Signing $UNPUSHED commit(s):"
git log --oneline origin/main.."$OLD"

W=$(mktemp -d "${TMPDIR:-/tmp}/sign-push-XXXXXX")
LOG=$(mktemp "${TMPDIR:-/tmp}/sign-push-log-XXXXXX")
cleanup() {
  git worktree remove --force "$W" 2>/dev/null || true
  rmdir "$W" 2>/dev/null || true
  rm -f "$LOG"
}
trap cleanup EXIT
# Ctrl-C during the 1Password prompt must still run the EXIT cleanup.
trap 'exit 130' INT TERM

git worktree add --detach "$W" "$OLD" >/dev/null

if ! git -C "$W" -c commit.gpgsign=true rebase \
  --exec 'git -c commit.gpgsign=true commit --amend --no-edit --no-verify --allow-empty -S' \
  origin/main >"$LOG" 2>&1; then
  cat "$LOG"
  git -C "$W" rebase --abort 2>/dev/null || true
  if grep -q "failed to fill whole buffer" "$LOG"; then
    echo "sign-push: 1Password is locked; unlock 1Password and run again"
  fi
  exit 1
fi

NEW=$(git -C "$W" rev-parse HEAD)

# Verify: same count, every commit carries a signature, identical trees.
[ "$(git -C "$W" rev-list --count origin/main..HEAD)" -eq "$UNPUSHED" ] \
  || { echo "sign-push: commit count changed after signing"; exit 1; }
for C in $(git -C "$W" rev-list origin/main..HEAD); do
  git cat-file commit "$C" | grep -q '^gpgsig ' || { echo "sign-push: $C is not signed"; exit 1; }
  # verify-commit needs gpg.ssh.allowedSignersFile for ssh; check it only when configured.
  if git config --get gpg.ssh.allowedSignersFile >/dev/null; then
    git -C "$W" verify-commit "$C" 2>/dev/null || { echo "sign-push: verify-commit failed for $C"; exit 1; }
  fi
done
[ "$OLD" = "$NEW" ] && { echo "sign-push: tip did not change"; exit 1; }
[ "$(git rev-parse "${OLD}^{tree}")" = "$(git rev-parse "${NEW}^{tree}")" ] || { echo "sign-push: trees differ after signing"; exit 1; }

git update-ref -m "sign-push" refs/heads/main "$NEW" "$OLD"
git worktree remove --force "$W"

git push origin main

echo "Pushed:"
git log --format='%h %G? %s' -n "$UNPUSHED"
