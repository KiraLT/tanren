#!/usr/bin/env bash
# PostToolUse hook (Edit|Write): format + safe-fix the touched file with Biome,
# then surface any remaining Biome diagnostics to the agent (exit 2 → stderr is
# shown to Claude). Exits 0 silently when Biome is not installed yet or the file
# is not one Biome handles.
set -u
input="$(cat)"
file="$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null)"
[ -n "$file" ] || exit 0
case "$file" in
  *.ts|*.tsx|*.mts|*.cts|*.js|*.jsx|*.mjs|*.cjs|*.json|*.jsonc|*.css) ;;
  *) exit 0 ;;
esac
[ -f "$file" ] || exit 0
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
# Only files inside the project: Biome panics on paths outside its root
# (agents prototype in the scratchpad; those files are not ours to format).
case "$file" in "$root"/*) ;; *) exit 0 ;; esac
biome="$root/node_modules/.bin/biome"
[ -x "$biome" ] || exit 0
cd "$root" || exit 0
out="$("$biome" check --write --no-errors-on-unmatched "$file" 2>&1)"
status=$?
if [ $status -ne 0 ]; then
  printf 'Biome diagnostics remain in %s (formatting was applied):\n%s\n' "$file" "$(printf '%s' "$out" | head -n 60)" >&2
  exit 2
fi
exit 0
