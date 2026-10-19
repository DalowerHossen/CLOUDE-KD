#!/usr/bin/env bash
# path: scripts/verify/step14-ledger.sh
# Concurrency check of the wallet ledger on a throw-away database (needs PGHOST, PGUSER; psql and createdb):
#   1. Twelve parallel debits of 40 against a wallet of 100: exactly two succeed, the balance is 20, never below zero.
#   2. Twelve parallel postings with the same key and the same request: one posting, eleven replays, one credit.
#   3. Parallel credits and debits at the same time: the balance equals the ledger sum and every posting adds up to zero.
set -euo pipefail
cd "$(dirname "$0")/../.."
command -v psql >/dev/null 2>&1 || { printf 'psql is required\n' >&2; exit 2; }
db="kd_wallet_$$"
createdb "$db"
export PGDATABASE="$db"
trap 'dropdb --if-exists "$db" >/dev/null 2>&1 || true' EXIT
psql -v ON_ERROR_STOP=1 -q -f supabase/local-shim.sql
PGOPTIONS="-c client_min_messages=warning" bash scripts/db-apply.sh --target >/dev/null 2>&1

q() { psql -At -q -v ON_ERROR_STOP=1 -c "$1"; }
fail() { printf 'FAIL  %s\n' "$1" >&2; exit 1; }
ok() { printf 'ok    %s\n' "$1"; }

company=$(q "insert into public.companies (name, slug) values ('Parallel Wallet', 'parallel-wallet') returning id")
wallet=$(q "insert into public.wallets (company_id) values ('$company') returning id")
credit() { # key amount
  echo "select public.kd_wallet_post('$company', '$1', 'Credit', 'test', null, jsonb_build_array(jsonb_build_object('wallet_id', '$wallet', 'account', 'available', 'amount', '$2'), jsonb_build_object('wallet_id', null, 'account', 'clearing', 'amount', '-$2')), null)"
}
debit() {
  echo "select public.kd_wallet_post('$company', '$1', 'Debit', 'test', null, jsonb_build_array(jsonb_build_object('wallet_id', '$wallet', 'account', 'available', 'amount', '-$2'), jsonb_build_object('wallet_id', null, 'account', 'clearing', 'amount', '$2')), null)"
}

q "$(credit seed-credit-1 100)" >/dev/null

# 1: twelve debits of 40 at once against 100
tmp=$(mktemp -d)
for i in $(seq 1 12); do
  (psql -At -q -c "$(debit "par-debit-$i" 40)" >"$tmp/out$i" 2>"$tmp/err$i" || true) &
done
wait
good=$(find "$tmp" -name 'out*' -size +0 | wc -l | tr -d ' ')
refused=$(grep -l "not enough funds" "$tmp"/err* 2>/dev/null | wc -l | tr -d ' ')
[ "$good" = "2" ] || fail "expected 2 debits to succeed, got $good"
[ "$refused" = "10" ] || fail "expected 10 refusals for lack of money, got $refused"
bal=$(q "select available_balance from public.wallets where id = '$wallet'")
[ "$bal" = "20.0000" ] || fail "balance should be 20, is $bal"
ok "12 parallel debits of 40 against 100: 2 succeed, 10 are refused, balance 20.0000"

# 2: the same posting twelve times at once
rm -rf "$tmp"; tmp=$(mktemp -d)
for i in $(seq 1 12); do
  (psql -At -q -c "$(credit same-key-0001 25)" >"$tmp/out$i" 2>"$tmp/err$i" || true) &
done
wait
[ -z "$(cat "$tmp"/err* 2>/dev/null)" ] || fail "errors: $(cat "$tmp"/err* | head -2)"
replays=$(grep -l '"replay": true' "$tmp"/out* | wc -l | tr -d ' ')
postings=$(q "select count(*) from public.wallet_postings where company_id = '$company' and idempotency_key = 'same-key-0001'")
bal=$(q "select available_balance from public.wallets where id = '$wallet'")
[ "$postings" = "1" ] && [ "$replays" = "11" ] || fail "expected 1 posting and 11 replays, got $postings and $replays"
[ "$bal" = "45.0000" ] || fail "balance should be 45, is $bal"
ok "12 parallel postings with one key: 1 posting, 11 replays, balance 45.0000"

# 3: mixed credits and debits, then the ledger must agree with the balance
rm -rf "$tmp"; tmp=$(mktemp -d)
for i in $(seq 1 20); do
  (psql -At -q -c "$(credit "mix-credit-$i" 10)" >/dev/null 2>&1 || true) &
  (psql -At -q -c "$(debit "mix-debit-$i" 7)" >/dev/null 2>&1 || true) &
done
wait
wrong=$(q "select count(*) from public.kd_wallet_verify()")
unbalanced=$(q "select count(*) from (select posting_id from public.ledger_entries group by posting_id having sum(amount) <> 0) x")
low=$(q "select count(*) from public.wallets where available_balance < 0")
[ "$wrong" = "0" ] || fail "$wrong wallet(s) differ from the ledger"
[ "$unbalanced" = "0" ] || fail "$unbalanced posting(s) do not add up to zero"
[ "$low" = "0" ] || fail "a wallet went below zero"
ok "40 mixed parallel postings: the balance equals the ledger, every posting adds up to zero, never below zero"
printf 'step14-ledger: ok\n'
