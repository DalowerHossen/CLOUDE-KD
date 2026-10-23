#!/usr/bin/env bash
# path: scripts/verify/step09-exports.sh
# Every table and column that STEP 09 registers for tenant exports must exist in the database (throw-away database;
# needs PGHOST, PGUSER; psql and createdb).
set -euo pipefail
cd "$(dirname "$0")/../.."
command -v psql >/dev/null 2>&1 || { printf 'psql is required\n' >&2; exit 2; }
db="kd_exports9_$$"
createdb "$db"
export PGDATABASE="$db"
trap 'dropdb --if-exists "$db" >/dev/null 2>&1 || true' EXIT
psql -v ON_ERROR_STOP=1 -q -f supabase/local-shim.sql
PGOPTIONS="-c client_min_messages=warning" bash scripts/db-apply.sh --target >/dev/null 2>&1
registered="$(npx tsx scripts/verify/step09-exports.ts | sort -u)"
existing="$(psql -At -c "select table_name || ' ' || column_name from information_schema.columns where table_schema = 'public'" | sort -u)"
missing="$(comm -23 <(printf '%s\n' "$registered") <(printf '%s\n' "$existing"))"
if [ -n "$missing" ]; then
  printf 'FAIL step09-exports: registered but not in the database:\n%s\n' "$missing" >&2
  exit 1
fi
printf 'ok    step09-exports (%s columns)\n' "$(printf '%s\n' "$registered" | wc -l | tr -d ' ')"
