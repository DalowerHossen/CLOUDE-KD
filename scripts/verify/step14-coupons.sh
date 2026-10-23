#!/usr/bin/env bash
# path: scripts/verify/step14-coupons.sh
# Concurrency check of coupon redemption on a throw-away database (needs PGHOST, PGUSER; psql and createdb):
#   1. 40 companies redeem a coupon that allows 5 uses, all at once: exactly 5 succeed.
#   2. One company redeems a one-time coupon 10 times at once: exactly 1 succeeds.
set -euo pipefail
cd "$(dirname "$0")/../.."
command -v psql >/dev/null 2>&1 || { printf 'psql is required\n' >&2; exit 2; }
db="kd_coupon_$$"
createdb "$db"
export PGDATABASE="$db"
trap 'dropdb --if-exists "$db" >/dev/null 2>&1 || true' EXIT
psql -v ON_ERROR_STOP=1 -q -f supabase/local-shim.sql
PGOPTIONS="-c client_min_messages=warning" bash scripts/db-apply.sh --target >/dev/null 2>&1

q() { psql -At -q -v ON_ERROR_STOP=1 -c "$1"; }
fail() { printf 'FAIL  %s\n' "$1" >&2; exit 1; }
ok() { printf 'ok    %s\n' "$1"; }

q "insert into public.coupons (code, name, kind, percent_off, max_redemptions) values ('LIMIT5', 'Five', 'percent', 10, 5)" >/dev/null
q "insert into public.coupons (code, name, kind, percent_off) values ('ONCEONLY', 'Once', 'percent', 10)" >/dev/null
q "insert into public.companies (name, slug) select 'Race ' || g, 'race-' || g from generate_series(1, 40) g" >/dev/null

tmp=$(mktemp -d)
for id in $(q "select id from public.companies where slug like 'race-%'"); do
  (q "select public.kd_coupon_redeem('LIMIT5', '$id', null, 'pro')->>'ok'" > "$tmp/$id" 2>"$tmp/$id.err") &
done
wait
bad=$(find "$tmp" -name '*.err' -size +0 | wc -l | tr -d ' ')
[ "$bad" = "0" ] || fail "$bad sessions failed: $(cat "$tmp"/*.err | head -3)"
okcount=$(cat "$tmp"/[0-9a-f]* 2>/dev/null | grep -c '^true$' || true)
[ "$okcount" = "5" ] || fail "expected 5 successful redemptions, got $okcount"
total=$(q "select count(*) from public.coupon_redemptions r join public.coupons c on c.id = r.coupon_id where c.code = 'LIMIT5'")
[ "$total" = "5" ] || fail "expected 5 stored redemptions, got $total"
ok "40 parallel companies take a coupon with 5 uses: exactly 5 succeed"

one=$(q "select id from public.companies where slug = 'race-1'")
tmp2=$(mktemp -d)
for i in $(seq 1 10); do
  (q "select public.kd_coupon_redeem('ONCEONLY', '$one', null, 'pro')->>'ok'" > "$tmp2/$i" 2>"$tmp2/$i.err") &
done
wait
okone=$(cat "$tmp2"/? "$tmp2"/?? 2>/dev/null | grep -c '^true$' || true)
[ "$okone" = "1" ] || fail "a one-time coupon worked $okone times for one company"
ok "10 parallel uses of a one-time coupon by one company: exactly 1 succeeds"
printf 'step14-coupons: ok\n'
