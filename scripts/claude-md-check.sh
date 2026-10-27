#!/bin/zsh
# Every backticked identifier in a CLAUDE.md must still exist in the tree, so the package docs
# cannot name a renamed or deleted symbol (CLAUDE-DIET trimmed apps/mobile/CLAUDE.md by hand and
# proved 288 tokens this way; this is that loop as a script).
#
# usage: scripts/claude-md-check.sh [path…]   default: ./CLAUDE.md, apps/*/CLAUDE.md, packages/*/CLAUDE.md
# exit 0: `ok <file> (<n> tokens)` per file; exit 1: `MISS <file>: <token>` per token found nowhere.
#
# A token is every `[A-Za-z_][A-Za-z0-9_./-]{3,}` run inside a backtick span. It passes when it is a
# substring of some tracked or untracked (non-ignored) file's content or path; CLAUDE.md files are not
# searched (they would vouch for each other). `git grep -f <all tokens>` takes a minute and one
# `git grep` per token takes ~0.07 s each, so: one pass lists every `[A-Za-z0-9_./-]+` run of the tree,
# awk expands each run into its segments between `.` `/` `-` boundaries, and `comm` finds the tokens
# that match none; only those few fall back to a per-token substring `git grep -qF`.
# Backticked prose that is not an identifier goes in scripts/claude-md-check.allow, one token per line.
set -euo pipefail
START=$SECONDS
R=${0:A:h:h}
cd "$R"
export LC_ALL=C

FILES=("$@")
if [ ${#FILES[@]} -eq 0 ]; then
  FILES=(CLAUDE.md apps/*/CLAUDE.md(N) packages/*/CLAUDE.md(N))
fi

TOK=$(mktemp "${TMPDIR:-/tmp}/claude-md-tok-XXXXXX")
CORP=$(mktemp "${TMPDIR:-/tmp}/claude-md-corpus-XXXXXX")
trap 'rm -f "$TOK" "$CORP"' EXIT

ALLOW=scripts/claude-md-check.allow
# not searched: CLAUDE.md files and this script's own files (their comments quote tokens)
EXCL=(':(exclude)**/CLAUDE.md' ':(exclude)scripts/claude-md-check.sh' ':(exclude)scripts/claude-md-check.allow')
{ git grep -ohE --untracked '[A-Za-z0-9_./-]+' -- . "${EXCL[@]}" || true
  git ls-files --cached --others --exclude-standard
} | sort -u | awk '{
  s = $0; L = length(s); ns = 0; ne = 0
  starts[ns++] = 1; ends[ne++] = L
  for (i = 1; i <= L; i++) {
    c = substr(s, i, 1)
    if (c == "." || c == "/" || c == "-") { starts[ns++] = i + 1; ends[ne++] = i - 1 }
  }
  for (a = 0; a < ns; a++) for (e = 0; e < ne; e++)
    if (ends[e] >= starts[a]) print substr(s, starts[a], ends[e] - starts[a] + 1)
}' | sort -u > "$CORP"

# A token is found when it is allowlisted or a substring of the tree (CLAUDE.md files excluded).
found() {
  { [ -f "$ALLOW" ] && grep -qxF -e "$1" "$ALLOW"; } && return 0
  git grep -qF --untracked -e "$1" -- . "${EXCL[@]}"
}

# `Class.member` and `a/b` notation: a token the tree does not contain whole passes when each of its
# `.`/`/`-separated parts of 3+ characters is found on its own (`SyncEngine.rekeyLocalUser`). A
# bare identifier gets no such leniency.
found_parts() {
  case "$1" in *[./]*) ;; *) return 1 ;; esac
  local p
  for p in ${(s:.:)${1//\//.}}; do
    [ ${#p} -ge 3 ] || continue
    found "$p" || return 1
  done
  return 0
}

rc=0
for f in $FILES; do
  grep -o '`[^`]*`' "$f" | tr -d '`' | grep -oE '[A-Za-z_][A-Za-z0-9_./-]{3,}' | sort -u > "$TOK" || true
  n=$(wc -l < "$TOK" | tr -d ' ')
  miss=""
  for t in ${(f)"$(comm -23 "$TOK" "$CORP")"}; do
    found "$t" && continue
    found_parts "$t" && continue
    miss+="$t"$'\n'
  done
  if [ -n "$miss" ]; then
    rc=1
    for t in ${(f)miss}; do echo "MISS $f: $t"; done
  else
    echo "ok $f ($n tokens)"
  fi
done
echo "claude-md-check: $((SECONDS - START)) s"
exit $rc
