#!/bin/zsh
# Typecheck exactly what is staged in the git INDEX, without touching the index or the working tree.
# Use before a commit while other agents keep editing the tree (a half-staged file once turned two
# clean-worktree deploy gates red). Mirrors `pnpm typecheck` (root tsconfig + every package's
# `typecheck` script). No `pnpm install`: the copy borrows the real tree's node_modules.
#
# Never run pnpm inside the copy: pnpm sees a missing install state, "installs", and rewrites the
# .bin shims it reaches through the symlinks IN THE REAL TREE (first draft, 2026-10-27: 27 shims
# pointed at the deleted tmpdir until `pnpm install --force --offline`). The scripts are read from
# the copy's package.json and run with sh and the real node_modules/.bin on PATH.
#
# Why node_modules is rebuilt per package: each package's `node_modules/@tanren/*` entries are
# relative links into the real tree; a plain symlink of node_modules would make `db` read `shared`
# from the working tree. Here every entry links to the real one except `@tanren/*`, which links to
# the copy's own packages.
set -euo pipefail
START=$SECONDS
R=${0:A:h:h}
cd "$R"
T=$(mktemp -d "${TMPDIR:-/tmp}/index-check-XXXXXX")
trap 'rm -r "$T" 2>/dev/null || true' EXIT

git checkout-index -a --prefix="$T/"

ln -s "$R/node_modules" "$T/node_modules"
PKGS=(apps/mobile apps/worker packages/shared packages/db)
for p in $PKGS; do
  [ -d "$R/$p/node_modules" ] || { echo "missing $R/$p/node_modules: run pnpm install in the real tree"; exit 2; }
  mkdir -p "$T/$p/node_modules"
  for e in "$R/$p/node_modules"/*(N); do
    [ "${e:t}" = "@tanren" ] && continue
    ln -s "$e" "$T/$p/node_modules/${e:t}"
  done
  mkdir -p "$T/$p/node_modules/@tanren"
  for l in "$R/$p/node_modules/@tanren"/*(N); do
    # the link target is relative to the real package; re-point it at the same package inside the copy
    ln -s "$T/packages/${l:t}" "$T/$p/node_modules/@tanren/${l:t}"
  done
done

run() { # <label> <dir> <command...>; runs as a background job, so failure is a marker file, not a variable
  local label=$1 dir=$2
  shift 2
  if (cd "$T/$dir" && "$@") >"$T/out-${label//\//_}.log" 2>&1; then
    echo "ok    $label"
  else
    echo "FAIL  $label"
    : >"$T/failed-${label//\//_}"
  fi
}

export PATH="$R/node_modules/.bin:$PATH"
cd "$T" # the scripts below are read from the INDEX copy's package.json files
run root . sh -c "$(node -p 'require("./package.json").scripts["typecheck:root"]')" &
for p in $PKGS; do
  run "$p" "$p" sh -c "$(node -p "require('./$p/package.json').scripts.typecheck")" &
done
wait

# Tab routes: Expo's typed routes live in git-ignored .expo/types, so tsc cannot see a staged route
# rename (a `today.tsx` → `home.tsx` rename once slipped into a commit with `APP_NAV` still saying
# `today`). The names in APP_NAV must equal the (tabs) route files minus _layout, in the INDEX copy.
tabs_nav=$(grep -o 'name: "[a-z]*"' "$T/apps/mobile/src/ui/appNav.ts" | sed 's/name: "\(.*\)"/\1/' | sort)
tabs_files=$(for f in "$T/apps/mobile/app/(tabs)"/*.tsx(N); do [ "${f:t:r}" = "_layout" ] || echo "${f:t:r}"; done | sort)
if [ "$tabs_nav" = "$tabs_files" ]; then
  echo "ok    tabs"
else
  echo "FAIL  tabs"
  echo "APP_NAV names:      $(echo $tabs_nav)"
  echo "(tabs)/*.tsx files: $(echo $tabs_files)"
  : >"$T/failed-tabs"
fi

if [ -n "$(echo "$T"/failed-*(N))" ]; then
  echo "== first 30 error lines"
  cat "$T"/out-*.log | grep -E "error|Error|ERR_" | head -30
  echo "== index-check RED in $((SECONDS - START))s"
  exit 1
fi
echo "== index-check green in $((SECONDS - START))s"
