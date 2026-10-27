#!/bin/sh
# PreToolUse(Bash): only the Lead (the main session) touches the git index and history. Inside a
# subagent (engineer, reviewer, qa, team-lead, EM) the hook input carries agent_type; the main
# session's input does not, so the Lead's own calls pass. An engineer's staged `git mv` was swept into
# an unrelated commit on 2026-10-27 (COMMIT-SWEEP, a04b551); dev-system §12 makes staging the Lead's.
# The match runs on the command text with heredoc bodies and quoted strings removed, so a doc edit
# that merely mentions `git commit` passes (EM batch 22: one false positive in the first hour).
# Known gap, accepted: `sh -c 'git add .'` is a quoted string and passes. Fail-open on any error.
input=$(cat)
agent=$(printf '%s' "$input" | jq -r '.agent_type // empty' 2>/dev/null) || exit 0
[ -z "$agent" ] && exit 0
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null) || exit 0
# 1. drop heredoc bodies: from a line carrying <<MARKER (quotes and - allowed) to the line that is MARKER
# 2. drop single- and double-quoted strings on the lines that remain
code=$(printf '%s\n' "$cmd" | awk '
  m != "" { if ($0 ~ ("^[[:space:]]*" m "[[:space:]]*$")) { m = "" }; next }
  { print; if (match($0, /<<-?[ ]*["'"'"']?[A-Za-z_][A-Za-z0-9_]*/)) { m = substr($0, RSTART, RLENGTH); sub(/^<<-?[ ]*["'"'"']?/, "", m) } }
' | sed -E "s/'[^']*'//g; s/\"[^\"]*\"//g")
if printf '%s' "$code" | grep -Eq '(^|[;&|(`[:space:]])git([[:space:]]+-[^[:space:]]*([[:space:]]+[^[:space:]]+)?)*[[:space:]]+(add|mv|rm|commit|reset|checkout|switch|restore|stash|rebase|cherry-pick|revert|merge|update-ref|update-index|read-tree|write-tree|commit-tree|apply|worktree|push)([[:space:]]|$)'; then
  printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Only the Lead touches the git index, branches and history (dev-system §12). Move or delete files with mv/rm and list every changed path in your report; the Lead stages and commits."}}'
fi
exit 0
