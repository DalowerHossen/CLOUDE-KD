#!/usr/bin/env bash
# path: scripts/verify/step08-stock.sh
# Concurrency check of the stock functions on a throw-away database (needs PGHOST, PGUSER; psql and createdb):
#   1. 60 requests take one unit each from a stock of 20: exactly 20 succeed, the rest are refused, stock ends at 0.
#   2. 40 transfers A to B and 40 transfers B to A at the same time: no deadlock, the total stays the same.
#   3. The same idempotency key sent 25 times at once changes the stock once.
#   4. The ledger adds up to the levels.
set -euo pipefail
cd "$(dirname "$0")/../.."
command -v psql >/dev/null 2>&1 || { printf 'psql is required\n' >&2; exit 2; }
db="kd_stock_$$"
createdb "$db"
export PGDATABASE="$db"
trap 'dropdb --if-exists "$db" >/dev/null 2>&1 || true' EXIT
psql -v ON_ERROR_STOP=1 -q -f supabase/local-shim.sql
PGOPTIONS="-c client_min_messages=warning" bash scripts/db-apply.sh --target >/dev/null 2>&1

q() { psql -At -q -v ON_ERROR_STOP=1 -c "$1"; }
company=$(q "insert into public.companies (name, slug) values ('Parallel Co', 'parallel-co') returning id")
wa=$(q "insert into public.warehouses (company_id, name, code, is_default) values ('$company', 'A', 'A', true) returning id")
wb=$(q "insert into public.warehouses (company_id, name, code) values ('$company', 'B', 'B') returning id")
product=$(q "insert into public.products (company_id, name, sku, track_inventory) values ('$company', 'Parallel item', 'P-1', true) returning id")
q "select count(*) from public.kd_stock_move('$company', '$product', null, '$wa', 20, null, 'receipt', null, null, null, '', null, 'seed', null)" >/dev/null

fail() { printf 'FAIL  %s\n' "$1" >&2; exit 1; }
ok() { printf 'ok    %s\n' "$1"; }

# 1. overselling
tmp=$(mktemp -d)
for i in $(seq 1 60); do
  ( if psql -At -q -c "select * from public.kd_stock_move('$company', '$product', null, '$wa', -1, null, 'sale', null, null, null, '', null, null, null)" >/dev/null 2>"$tmp/e$i"; then echo ok > "$tmp/r$i"; else echo refused > "$tmp/r$i"; fi ) &
done
wait
sold=$(cat "$tmp"/r* | grep -c '^ok$' || true)
refused=$(cat "$tmp"/r* | grep -c '^refused$' || true)
left=$(q "select quantity from public.stock_levels where product_id = '$product' and warehouse_id = '$wa'")
[ "$sold" = "20" ] || fail "expected 20 sales, got $sold"
[ "$refused" = "40" ] || fail "expected 40 refusals, got $refused"
[ "$(echo "$left" | cut -d. -f1)" = "0" ] || fail "stock ended at $left"
grep -q 'insufficient stock' "$tmp"/e* || fail "refusals did not say insufficient stock"
ok "60 parallel sales of 20 units: 20 sold, 40 refused, stock 0, never negative"

# 2. opposite transfers
q "select count(*) from public.kd_stock_move('$company', '$product', null, '$wa', 30, null, 'receipt', null, null, null, '', null, null, null)" >/dev/null
q "select count(*) from public.kd_stock_move('$company', '$product', null, '$wb', 30, null, 'receipt', null, null, null, '', null, null, null)" >/dev/null
rm -f "$tmp"/*
for i in $(seq 1 40); do
  ( psql -At -q -c "select * from public.kd_stock_transfer('$company', '$product', null, '$wa', '$wb', 1, null, null, '')" >/dev/null 2>"$tmp/a$i" && echo ok > "$tmp/ra$i" || echo refused > "$tmp/ra$i" ) &
  ( psql -At -q -c "select * from public.kd_stock_transfer('$company', '$product', null, '$wb', '$wa', 1, null, null, '')" >/dev/null 2>"$tmp/b$i" && echo ok > "$tmp/rb$i" || echo refused > "$tmp/rb$i" ) &
done
wait
if grep -qi 'deadlock' "$tmp"/a* "$tmp"/b* 2>/dev/null; then fail "a deadlock happened"; fi
total=$(q "select sum(quantity) from public.stock_levels where product_id = '$product'")
[ "$(echo "$total" | cut -d. -f1)" = "60" ] || fail "total after transfers is $total, expected 60"
negative=$(q "select count(*) from public.stock_levels where quantity < 0")
[ "$negative" = "0" ] || fail "negative stock found"
ok "80 opposite transfers at once: no deadlock, total stays 60"

# 3. one idempotency key, many requests
rm -f "$tmp"/*
before=$(q "select quantity from public.stock_levels where product_id = '$product' and warehouse_id = '$wa'")
for i in $(seq 1 25); do
  ( psql -At -q -c "select * from public.kd_stock_move('$company', '$product', null, '$wa', 2, null, 'receipt', null, null, null, '', null, 'same-key', null)" >/dev/null 2>/dev/null || true ) &
done
wait
after=$(q "select quantity from public.stock_levels where product_id = '$product' and warehouse_id = '$wa'")
diff=$(q "select ($after::numeric - $before::numeric)")
[ "$(echo "$diff" | cut -d. -f1)" = "2" ] || fail "the key was applied more than once (change $diff)"
ok "25 parallel requests with one idempotency key: applied once"

# 4. ledger = levels
ledger=$(q "select sum(quantity_delta) from public.stock_movements where product_id = '$product'")
levels=$(q "select sum(quantity) from public.stock_levels where product_id = '$product'")
[ "$ledger" = "$levels" ] || fail "ledger $ledger differs from levels $levels"
ok "the ledger adds up to the stock levels ($levels)"
rm -rf "$tmp"
printf 'step08-stock: ok\n'
