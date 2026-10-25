#!/usr/bin/env bash
# path: scripts/verify-all.sh
# Runs every verification script of scripts/verify/ and fails if one of them fails. Nothing here replaces the guards of
# check-all.sh; these scripts check the behaviour of the code.
#   scripts/verify-all.sh app    scripts that need no database (TypeScript flows with fakes, static scans, PDF drawing)
#   scripts/verify-all.sh db     scripts that need a reachable PostgreSQL (PGHOST, PGUSER, PGPASSWORD): concurrency and exports
# A new script is picked up by name: add it to HELPERS or PLAIN below only when it is not a check, or needs no react-server.
set -uo pipefail
cd "$(dirname "$0")/.."
mode="${1:-app}"
export SKIP_ENV_VALIDATION=1

# Files that other checks import or run; they are not checks themselves.
HELPERS=" step10-fake-db.ts step10-flow-setup.ts step10-readme.ts step08-exports.ts step09-exports.ts "
# Checks that load React or Next code and must not run with the react-server condition.
PLAIN=" step01-core.ts step05-core.ts step08-core.ts step13-emails.ts step16-cron-tick.ts "
# Checks that need a database.
DBFILES=" step08-exports.sh step08-stock.sh step09-exports.sh step09-numbering.sh step09-recurring.sh step14-client-subscriptions.sh step14-coupons.sh step14-ledger.sh step14-subscriptions.sh "

failed=()
ran=0
run() {
  local name="$1"
  shift
  local log
  log="$(mktemp)"
  if "$@" >"$log" 2>&1; then
    printf 'ok    %s\n' "$name"
  else
    printf 'FAIL  %s\n' "$name"
    grep -v '^{"ts"' "$log" | tail -15 | sed 's/^/        /'
    failed+=("$name")
  fi
  rm -f "$log"
  ran=$((ran + 1))
}

for file in scripts/verify/*; do
  name="$(basename "$file")"
  case "$HELPERS" in *" $name "*) continue ;; esac
  isdb=0
  case "$DBFILES" in *" $name "*) isdb=1 ;; esac
  if [ "$mode" = "db" ] && [ "$isdb" -eq 0 ]; then continue; fi
  if [ "$mode" = "app" ] && [ "$isdb" -eq 1 ]; then continue; fi
  case "$name" in
    *.ts)
      case "$PLAIN" in
        *" $name "*) run "$name" npx tsx "$file" ;;
        *) run "$name" npx tsx --conditions=react-server "$file" ;;
      esac
      ;;
    *.mts) run "$name" npx tsx "$file" ;;
    *.mjs) run "$name" node "$file" ;;
    *.sh) run "$name" bash "$file" ;;
    *) ;;
  esac
done

printf '\nverify-all (%s): %s script(s), %s failed\n' "$mode" "$ran" "${#failed[@]}"
if [ "${#failed[@]}" -gt 0 ]; then
  printf 'failed: %s\n' "${failed[*]}"
  exit 1
fi
