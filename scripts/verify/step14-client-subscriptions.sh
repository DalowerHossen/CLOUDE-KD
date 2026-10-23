#!/usr/bin/env bash
# path: scripts/verify/step14-client-subscriptions.sh
# Concurrency check of the billing claim on a throw-away database (needs PGHOST, PGUSER; psql and createdb):
# 30 parallel jobs claim the same billing cycle of one subscription: exactly one claim is stored, 29 are refused by the key.
set -euo pipefail
cd "$(dirname "$0")/../.."
command -v psql >/dev/null 2>&1 || { printf 'psql is required\n' >&2; exit 2; }
db="kd_csub_$$"
createdb "$db"
export PGDATABASE="$db"
trap 'dropdb --if-exists "$db" >/dev/null 2>&1 || true' EXIT
psql -v ON_ERROR_STOP=1 -q -f supabase/local-shim.sql
PGOPTIONS="-c client_min_messages=warning" bash scripts/db-apply.sh --target >/dev/null 2>&1

q() { psql -At -q -c "$1"; }
fail() { printf 'FAIL  %s\n' "$1" >&2; exit 1; }
ok() { printf 'ok    %s\n' "$1"; }

company=$(q "insert into public.companies (name, slug) values ('Claim Co', 'claim-co') returning id")
client=$(q "insert into public.clients (company_id, name) values ('$company', 'Claim Client') returning id")
plan=$(q "insert into public.client_subscription_plans (company_id, name, price) values ('$company', 'Gold', 49) returning id")
sub=$(q "insert into public.client_subscriptions (company_id, client_id, plan_id, interval, price, current_period_start, current_period_end, next_billing_at) values ('$company', '$client', '$plan', 'month', 49, now(), now() + interval '30 days', now()) returning id")

tmp=$(mktemp -d)
for i in $(seq 1 30); do
  (psql -At -q -c "insert into public.client_billing_runs (company_id, subscription_id, period_start, period_end) values ('$company', '$sub', '2026-11-01', '2026-12-01')" > "$tmp/$i" 2>"$tmp/$i.err" || true) &
done
wait
stored=$(q "select count(*) from public.client_billing_runs where subscription_id = '$sub'")
[ "$stored" = "1" ] || fail "expected one stored claim, found $stored"
refused=$(grep -l 'duplicate key' "$tmp"/*.err 2>/dev/null | wc -l | tr -d ' ')
[ "$refused" = "29" ] || fail "expected 29 refusals by the unique key, found $refused"
ok "30 parallel jobs claim one billing cycle: 1 stored, 29 refused"
printf 'step14-client-subscriptions: ok\n'
