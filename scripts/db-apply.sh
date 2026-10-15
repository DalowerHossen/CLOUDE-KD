#!/usr/bin/env bash
# path: scripts/db-apply.sh
# Applies migrations/*.sql (not *_down.sql) in file-name order.
#   scripts/db-apply.sh --clean [--keep] [--no-assert]   fresh temporary database (needs a reachable PostgreSQL; use PGHOST, PGPORT, PGUSER, PGPASSWORD)
#   scripts/db-apply.sh --target                         apply to the database named by PGDATABASE (existing)
#   scripts/db-apply.sh --down <migration-file>          run the matching rollback file on PGDATABASE
set -euo pipefail
cd "$(dirname "$0")/.."

mode=""
keep=0
assert=1
down_file=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --clean) mode=clean ;;
    --target) mode=target ;;
    --down) mode=down; down_file="${2:?migration file required}"; shift ;;
    --keep) keep=1 ;;
    --no-assert) assert=0 ;;
    *) printf 'unknown option %s\n' "$1" >&2; exit 2 ;;
  esac
  shift
done
[ -n "$mode" ] || { printf 'usage: db-apply.sh --clean|--target|--down <file>\n' >&2; exit 2; }

shopt -s nullglob
ups=()
for f in migrations/S*.sql; do
  case "$f" in *_down.sql) ;; *) ups+=("$f") ;; esac
done

if [ "$mode" = "down" ]; then
  down="migrations/${down_file%.sql}_down.sql"
  [ -f "$down" ] || { printf 'rollback file not found: %s\n' "$down" >&2; exit 2; }
  psql -v ON_ERROR_STOP=1 -q -f "$down"
  exit 0
fi

if [ "${#ups[@]}" -eq 0 ]; then
  printf 'db-apply: no migrations yet (nothing to apply)\n'
  exit 0
fi
command -v psql >/dev/null 2>&1 || { printf 'psql is required\n' >&2; exit 2; }

if [ "$mode" = "clean" ]; then
  db="kd_check_$$"
  createdb "$db"
  export PGDATABASE="$db"
  cleanup() { if [ "$keep" -eq 0 ]; then dropdb --if-exists "$db" >/dev/null 2>&1 || true; fi; }
  trap cleanup EXIT
  psql -v ON_ERROR_STOP=1 -q -f supabase/local-shim.sql
fi

for f in "${ups[@]}"; do
  printf 'applying %s\n' "$f"
  psql -v ON_ERROR_STOP=1 -q -f "$f"
done
# Idempotency check: every migration must be safe to run twice.
for f in "${ups[@]}"; do
  psql -v ON_ERROR_STOP=1 -q -f "$f" > /dev/null
done
printf 'db-apply: %d migration(s) applied and re-applied cleanly\n' "${#ups[@]}"

if [ "$mode" = "clean" ] && [ "$assert" -eq 1 ]; then
  bash scripts/run-assertions.sh all
fi
