#!/usr/bin/env bash
# path: scripts/check-no-brand-names.sh
# Rule 18: payment partner brand names are never written. Use generic names.
GUARD_NAME=no-brand-names
source "$(dirname "$0")/lib/common.sh"

lower_pattern='\b(bkash|nagad|gcash|promptpay|paynow|upi|alipay|wechat[ _-]?pay|duitnow|momo|gopay|paypay|kakaopay|grabpay|truemoney)\b'
upper_pattern='\b(OVO|DANA|BOOST)\b'
while IFS= read -r f; do
  [ -f "$f" ] || continue
  if grep -IniE "$lower_pattern" "$f" > /tmp/guard-brand.$$ 2>/dev/null; then
    fail "payment partner brand name in $f: $(head -n 1 /tmp/guard-brand.$$ | cut -c1-100)"
  fi
  if grep -InE "$upper_pattern" "$f" > /tmp/guard-brand.$$ 2>/dev/null; then
    fail "payment partner brand name in $f: $(head -n 1 /tmp/guard-brand.$$ | cut -c1-100)"
  fi
done < <(files_matching "$CODE_DIRS_REGEX" | grep -vE '\.(png|jpg|jpeg|webp|avif|ico|woff2?)$')
rm -f /tmp/guard-brand.$$
finish
