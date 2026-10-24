#!/usr/bin/env bash
# path: scripts/verify/step09-recurring.sh
# Concurrency check of recurring invoices on a throw-away database (needs PGHOST, PGUSER; psql and createdb):
#   1. 20 workers claim the same due occurrence at the same time: exactly one gets it.
#   2. Ten sessions apply 40 each from a credit of 100: only two fit (an application never takes more than what is left).
#   3. Ten workers claim the items of a batch of 60 at the same time: every item is taken exactly once.
set -euo pipefail
cd "$(dirname "$0")/../.."
command -v psql >/dev/null 2>&1 || { printf 'psql is required\n' >&2; exit 2; }
db="kd_rec_$$"
createdb "$db"
export PGDATABASE="$db"
trap 'dropdb --if-exists "$db" >/dev/null 2>&1 || true' EXIT
psql -v ON_ERROR_STOP=1 -q -f supabase/local-shim.sql
PGOPTIONS="-c client_min_messages=warning" bash scripts/db-apply.sh --target >/dev/null 2>&1

q() { psql -At -q -v ON_ERROR_STOP=1 -c "$1"; }
fail() { printf 'FAIL  %s\n' "$1" >&2; exit 1; }
ok() { printf 'ok    %s\n' "$1"; }

company=$(q "insert into public.companies (name, slug) values ('Parallel Rec', 'parallel-rec') returning id")
client=$(q "insert into public.clients (company_id, name) values ('$company', 'Buyer') returning id")
schedule=$(q "insert into public.recurring_schedules (company_id, client_id, name, template, unit, every, start_date, next_run_date, created_by) values ('$company', '$client', 'Monthly', '{}', 'month', 1, current_date, current_date, gen_random_uuid()) returning id")

tmp=$(mktemp -d)
for i in $(seq 1 20); do
  (q "select count(run_id) from public.kd_recurring_claim('$schedule', current_date)" > "$tmp/c$i" 2>"$tmp/c$i.err") &
done
wait
[ "$(find "$tmp" -name 'c*.err' -size +0 | wc -l | tr -d ' ')" = "0" ] || fail "claims failed: $(cat "$tmp"/*.err | head -3)"
total=$(cat "$tmp"/c? "$tmp"/c?? 2>/dev/null | awk '{s += $1} END {print s}')
[ "$total" = "1" ] || fail "20 workers claimed the same occurrence $total times"
runs=$(q "select count(*) from public.recurring_runs where schedule_id = '$schedule'")
[ "$runs" = "1" ] || fail "expected one run row, found $runs"
ok "20 parallel workers claim one occurrence exactly once"

# 2: 10 sessions apply 40 each from a credit of 100: only two fit
bill='{"name":"Buyer","postalCode":"10001","country":"US"}'
invoice=$(q "insert into public.invoices (company_id, client_id, bill_to, total, amount_due, status, number) values ('$company', '$client', '$bill', 1000, 1000, 'sent', 'INV-1') returning id")
credit=$(q "insert into public.credit_notes (company_id, client_id, invoice_id, reason, bill_to, options, lines, total, status, number) values ('$company', '$client', '$invoice', 'goodwill', '$bill', '{}', '[{\"description\":\"x\"}]', 100, 'issued', 'CN-1') returning id")
for i in $(seq 1 10); do
  (psql -At -q -c "select public.kd_credit_apply('$company', 'credit_note', '$credit', '$invoice', 40, null)" >/dev/null 2>&1 && echo ok > "$tmp/a$i") &
done
wait
applied=$(q "select applied_amount from public.credit_notes where id = '$credit'")
[ "$applied" = "80.0000" ] || fail "credit applied $applied instead of 80"
paid=$(q "select amount_paid from public.invoices where id = '$invoice'")
[ "$paid" = "80.0000" ] || fail "invoice paid $paid instead of 80"
ok "10 parallel applications of 40 from a credit of 100 take exactly 80"

# 3: 60 batch items, 10 workers each asking for 20: 60 claims in all, no item twice
batch=$(q "insert into public.invoice_batches (company_id, action, item_count, created_by, created_role) values ('$company', 'send', 60, gen_random_uuid(), 'owner') returning id")
q "insert into public.invoices (company_id, walk_in_name, bill_to) select '$company', 'W' || g, '$bill' from generate_series(1, 60) g" >/dev/null
q "insert into public.invoice_batch_items (company_id, batch_id, action, invoice_id) select '$company', '$batch', 'send', i.id from public.invoices i where i.company_id = '$company' and i.walk_in_name like 'W%'" >/dev/null
for i in $(seq 1 10); do
  (psql -At -q -c "select item_id from public.kd_batch_claim(20)" > "$tmp/b$i" 2>"$tmp/b$i.err") &
done
wait
[ "$(find "$tmp" -name 'b*.err' -size +0 | wc -l | tr -d ' ')" = "0" ] || fail "batch claims failed: $(cat "$tmp"/b*.err | head -3)"
claimed=$(cat "$tmp"/b? "$tmp"/b?? 2>/dev/null | grep -c . || true)
distinct=$(cat "$tmp"/b? "$tmp"/b?? 2>/dev/null | sort -u | grep -c . || true)
[ "$claimed" = "60" ] && [ "$distinct" = "60" ] || fail "batch items claimed $claimed times for $distinct different items (expected 60 and 60)"
ok "10 parallel workers claim 60 batch items exactly once each"
printf 'step09-recurring: ok\n'
