#!/usr/bin/env bash
# path: scripts/check-no-any.sh
# Rule 6: no `any` type in TypeScript. ESLint (no-explicit-any) is the primary enforcement; this guard works without installing dependencies.
GUARD_NAME=no-any
source "$(dirname "$0")/lib/common.sh"

pattern='(:|\bas|<|,|\bextends|\||&)[[:space:]]*any\b([[:space:]]*[]>,;)=|&}\[]|[[:space:]]*$)'
while IFS= read -r f; do
  [ -f "$f" ] || continue
  if grep -InE "$pattern" "$f" > /tmp/guard-any.$$ 2>/dev/null; then
    fail "any type in $f: $(head -n 1 /tmp/guard-any.$$ | cut -c1-100)"
  fi
done < <(files_matching '\.(ts|tsx)$' | grep -vE '^(docs|node_modules)/')
rm -f /tmp/guard-any.$$
finish
