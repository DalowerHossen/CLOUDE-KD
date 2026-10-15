#!/usr/bin/env bash
# path: scripts/check-no-todo.sh
# Rule 5: no unfinished-work markers in code.
GUARD_NAME=no-todo
source "$(dirname "$0")/lib/common.sh"

marker_a="TO""DO"
marker_b="FIX""ME"
pattern="\\b(${marker_a}|${marker_b})\\b"
while IFS= read -r f; do
  [ -f "$f" ] || continue
  if grep -InE "$pattern" "$f" > /tmp/guard-todo.$$ 2>/dev/null; then
    fail "unfinished-work marker in $f: $(head -n 1 /tmp/guard-todo.$$ | cut -c1-100)"
  fi
done < <(files_matching "($CODE_DIRS_REGEX|^scripts/)" | grep -vE '\.(png|jpg|jpeg|webp|avif|ico|woff2?)$')
rm -f /tmp/guard-todo.$$
finish
