#!/usr/bin/env bash
# path: scripts/check-all.sh
# Runs every guard script. `--fast` skips the checks that need a built application.
set -uo pipefail
cd "$(dirname "$0")/.."
export GUARD_ROOT="${GUARD_ROOT:-$PWD}"
failed=0
run() {
  local label="$1"
  shift
  if "$@" > /tmp/check-all.$$ 2>&1; then
    printf 'ok    %s\n' "$label"
  else
    printf 'FAIL  %s\n' "$label"
    sed 's/^/      /' /tmp/check-all.$$ >&2
    failed=1
  fi
}
for s in check-english-only check-no-tests check-no-todo check-no-coming-soon check-path-comment check-no-any check-no-console check-no-pan check-no-brand-names check-money check-secrets; do
  run "$s" bash "scripts/$s.sh"
done
run check-migrations node scripts/check-migrations.mjs
run check-dead-links node scripts/check-dead-links.mjs
rm -f /tmp/check-all.$$
if [ "$failed" -ne 0 ]; then
  printf 'check-all: FAILED\n' >&2
  exit 1
fi
printf 'check-all: ok\n'
