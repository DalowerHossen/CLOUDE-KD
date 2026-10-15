#!/usr/bin/env bash
# path: scripts/run-assertions.sh
# Usage: scripts/run-assertions.sh <sNN|all>   (database from PGDATABASE and the libpq environment)
# Each sql/assertions/*.sql file raises an exception on failure. Every file runs inside a transaction that is rolled back.
set -euo pipefail
cd "$(dirname "$0")/.."
prefix="${1:?usage: run-assertions.sh <sNN|all>}"
shopt -s nullglob
if [ "$prefix" = "all" ]; then files=(sql/assertions/s*.sql); else files=(sql/assertions/"${prefix}"_*.sql); fi
if [ "${#files[@]}" -eq 0 ]; then
  printf 'run-assertions: no assertion files for "%s"\n' "$prefix"
  exit 0
fi
command -v psql >/dev/null 2>&1 || { printf 'psql is required\n' >&2; exit 2; }
failed=0
for f in "${files[@]}"; do
  if { echo 'begin;'; cat "$f"; echo 'rollback;'; } | psql -v ON_ERROR_STOP=1 -q > /tmp/assert.$$ 2>&1; then
    printf 'ok    %s\n' "$f"
  else
    printf 'FAIL  %s\n' "$f" >&2
    sed 's/^/      /' /tmp/assert.$$ >&2
    failed=1
  fi
done
rm -f /tmp/assert.$$
exit "$failed"
