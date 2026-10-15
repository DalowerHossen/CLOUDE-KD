#!/usr/bin/env bash
# path: scripts/check-no-console.sh
# Rule 7: no console usage; lib/logger/sink.ts is the single allowed place.
GUARD_NAME=no-console
source "$(dirname "$0")/lib/common.sh"

while IFS= read -r f; do
  [ -f "$f" ] || continue
  [ "$f" = "lib/logger/sink.ts" ] && continue
  if grep -InE '\bconsole\.(log|debug|info|warn|error|trace|dir|table|time)\b' "$f" > /tmp/guard-con.$$ 2>/dev/null; then
    fail "console usage in $f: $(head -n 1 /tmp/guard-con.$$ | cut -c1-100)"
  fi
done < <(files_matching '\.(ts|tsx|js|mjs|cjs)$' | grep -E "($CODE_DIRS_REGEX)" | grep -vE '^(node_modules)/')
rm -f /tmp/guard-con.$$
finish
