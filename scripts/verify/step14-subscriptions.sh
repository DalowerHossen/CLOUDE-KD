#!/usr/bin/env bash
# path: scripts/verify/step14-subscriptions.sh
# Concurrency check of platform invoice numbers on a throw-away database (needs PGHOST, PGUSER; psql and createdb):
# 100 parallel sessions ask for a number: the numbers are 1 to 100 with no gap and no repeat.
set -euo pipefail
cd "$(dirname "$0")/../.."
command -v psql >/dev/null 2>&1 || { printf 'psql is required\n' >&2; exit 2; }
db="kd_pinv_$$"
createdb "$db"
export PGDATABASE="$db"
trap 'dropdb --if-exists "$db" >/dev/null 2>&1 || true' EXIT
psql -v ON_ERROR_STOP=1 -q -f supabase/local-shim.sql
PGOPTIONS="-c client_min_messages=warning" bash scripts/db-apply.sh --target >/dev/null 2>&1

q() { psql -At -q -v ON_ERROR_STOP=1 -c "$1"; }
fail() { printf 'FAIL  %s\n' "$1" >&2; exit 1; }
ok() { printf 'ok    %s\n' "$1"; }

tmp=$(mktemp -d)
for i in $(seq 1 100); do
  (q "select public.kd_platform_invoice_number(2026)" > "$tmp/$i" 2>"$tmp/$i.err") &
done
wait
bad=$(find "$tmp" -name '*.err' -size +0 | wc -l | tr -d ' ')
[ "$bad" = "0" ] || fail "$bad sessions failed: $(cat "$tmp"/*.err | head -3)"
stats=$(cat "$tmp"/? "$tmp"/?? "$tmp"/??? 2>/dev/null | grep -v '^$' | sed 's/PI-2026-//' | sort -u | awk 'NR==1{min=$1+0} {max=$1+0; n++} END{print n ":" min ":" max}')
[ "$stats" = "100:1:100" ] || fail "numbers are not 1 to 100 without gaps: $stats"
ok "100 parallel invoice numbers are 1 to 100, no gap, no repeat"
printf 'step14-subscriptions: ok\n'
