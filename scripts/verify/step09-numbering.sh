#!/usr/bin/env bash
# path: scripts/verify/step09-numbering.sh
# Concurrency check of invoice numbering on a throw-away database (needs PGHOST, PGUSER; psql and createdb):
#   1. 100 invoices are numbered by 100 parallel sessions: the numbers are 1 to 100 with no gap and no repeat.
#   2. A number taken in a transaction that is rolled back is not lost: the next invoice gets the same number.
#   3. Two series (invoices and debit notes) run at the same time without sharing numbers.
set -euo pipefail
cd "$(dirname "$0")/../.."
command -v psql >/dev/null 2>&1 || { printf 'psql is required\n' >&2; exit 2; }
db="kd_num_$$"
createdb "$db"
export PGDATABASE="$db"
trap 'dropdb --if-exists "$db" >/dev/null 2>&1 || true' EXIT
psql -v ON_ERROR_STOP=1 -q -f supabase/local-shim.sql
PGOPTIONS="-c client_min_messages=warning" bash scripts/db-apply.sh --target >/dev/null 2>&1

q() { psql -At -q -v ON_ERROR_STOP=1 -c "$1"; }
fail() { printf 'FAIL  %s\n' "$1" >&2; exit 1; }
ok() { printf 'ok    %s\n' "$1"; }

company=$(q "insert into public.companies (name, slug) values ('Parallel Num', 'parallel-num') returning id")
q "insert into public.invoices (company_id, walk_in_name) select '$company', 'W' || g from generate_series(1, 100) g" >/dev/null
q "insert into public.invoices (company_id, walk_in_name, kind) select '$company', 'D' || g, 'debit_note' from generate_series(1, 20) g" >/dev/null

# 1 and 3: all invoices and all debit notes at once
tmp=$(mktemp -d)
for id in $(q "select id from public.invoices where company_id = '$company' order by created_at, id"); do
  (q "select public.kd_invoice_assign_number('$company', '$id', 'N-', false, 4, 1, 2026, null)" > "$tmp/$id" 2>"$tmp/$id.err") &
done
wait
bad=$(find "$tmp" -name '*.err' -size +0 | wc -l | tr -d ' ')
[ "$bad" = "0" ] || fail "$bad sessions failed: $(cat "$tmp"/*.err | head -3)"
inv=$(q "select count(distinct number) || ':' || min(substr(number, 3)::int) || ':' || max(substr(number, 3)::int) from public.invoices where company_id = '$company' and kind = 'invoice'")
[ "$inv" = "100:1:100" ] || fail "invoice numbers are not 1 to 100 without gaps: $inv"
dn=$(q "select count(distinct number) || ':' || min(substr(number, 3)::int) || ':' || max(substr(number, 3)::int) from public.invoices where company_id = '$company' and kind = 'debit_note'")
[ "$dn" = "20:1:20" ] || fail "debit note numbers are not 1 to 20 without gaps: $dn"
ok "100 parallel invoice numbers are 1 to 100 and 20 parallel debit notes are 1 to 20, no gap, no repeat"

# 2: a rolled-back transaction gives its number back
extra=$(q "insert into public.invoices (company_id, walk_in_name) values ('$company', 'Later') returning id")
psql -At -q -v ON_ERROR_STOP=1 >/dev/null <<SQL
begin;
select public.kd_invoice_assign_number('$company', '$extra', 'N-', false, 4, 1, 2026, null);
rollback;
SQL
n=$(q "select public.kd_invoice_assign_number('$company', '$extra', 'N-', false, 4, 1, 2026, null)")
[ "$n" = "N-0101" ] || fail "a rolled-back number was lost: $n"
ok "a number taken in a rolled-back transaction is not lost (next is $n)"
printf 'step09-numbering: ok\n'
