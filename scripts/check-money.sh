#!/usr/bin/env bash
# path: scripts/check-money.sh
# Rule 2: no JavaScript Number arithmetic in money code. Money uses lib/utils/currency.ts (decimal.js).
GUARD_NAME=money
source "$(dirname "$0")/lib/common.sh"

money_name='(money|currency|invoice|payment|wallet|ledger|payroll|salary|tax|price|amount|fee|journal|refund|payout|settle|billing|checkout|subscription)'
while IFS= read -r f; do
  [ -f "$f" ] || continue
  if grep -InE '\bparseFloat\(|\bNumber\(|\bparseInt\(|Math\.(round|floor|ceil|trunc)\(' "$f" > /tmp/guard-money.$$ 2>/dev/null; then
    fail "Number arithmetic in money code $f: $(head -n 1 /tmp/guard-money.$$ | cut -c1-100)"
  fi
  if [ "$f" != "lib/utils/currency.ts" ] && grep -InE '\.toFixed\(' "$f" > /tmp/guard-money.$$ 2>/dev/null; then
    fail "toFixed in money code $f (use Money): $(head -n 1 /tmp/guard-money.$$ | cut -c1-100)"
  fi
done < <(files_matching '\.(ts|tsx)$' | grep -E '^(app|components|lib|services|schemas|stores)/' | grep -iE "$money_name")
rm -f /tmp/guard-money.$$
finish
