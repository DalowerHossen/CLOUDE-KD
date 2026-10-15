#!/usr/bin/env bash
# path: scripts/check-no-pan.sh
# Card data rule: our code never handles card number, expiry or CVV, and never tracks key presses on payment pages.
GUARD_NAME=no-pan
source "$(dirname "$0")/lib/common.sh"

field_pattern='\b(cardNumber|card_number|cardnumber|cardNo|ccNumber|cc_number|cc-number|cc-csc|cc-exp|cc-exp-month|cc-exp-year|securityCode|security_code|primaryAccountNumber|cvv|cvv2|cvc|cvc2)\b'
while IFS= read -r f; do
  [ -f "$f" ] || continue
  # The log redaction list must name these fields in order to hide them.
  [ "$f" = "lib/logger/redact.ts" ] && continue
  if grep -InE "$field_pattern" "$f" > /tmp/guard-pan.$$ 2>/dev/null; then
    fail "card field handling in $f: $(head -n 1 /tmp/guard-pan.$$ | cut -c1-100)"
  fi
done < <(files_matching '\.(ts|tsx|js|mjs|cjs|css|html)$' | grep -E '^(app|components|lib|services|emails|pdf-templates|stores|schemas)/')

key_pattern='onKey(Down|Up|Press)|addEventListener\([[:space:]]*["'"'"']key|onInput=|onBeforeInput='
while IFS= read -r f; do
  [ -f "$f" ] || continue
  if grep -InE "$key_pattern" "$f" > /tmp/guard-key.$$ 2>/dev/null; then
    fail "key tracking in payment or portal code $f: $(head -n 1 /tmp/guard-key.$$ | cut -c1-100)"
  fi
done < <(files_matching '\.(ts|tsx)$' | grep -E '^(components/payment/|app/\(client-portal\)/|services/payment/|lib/payment/)')
rm -f /tmp/guard-pan.$$ /tmp/guard-key.$$
finish
