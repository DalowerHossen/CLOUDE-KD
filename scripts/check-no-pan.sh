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

# STEP 10: extra rules for payment code (REQ-CARD item 1). Payment pages and services never keep card or token data in
# the browser, never run behaviour or analytics code, and never write markup from strings.
payment_paths='^(components/payment/|services/payment/|lib/payment/|app/api/(payments|payment-links|refunds|webhooks)/|app/\(dashboard\)/payments/)'
storage_pattern='localStorage|sessionStorage|indexedDB|document\.cookie|navigator\.sendBeacon|dangerouslySetInnerHTML'
while IFS= read -r f; do
  [ -f "$f" ] || continue
  if grep -InE "$storage_pattern" "$f" > /tmp/guard-pay.$$ 2>/dev/null; then
    fail "browser storage, beacon or raw markup in payment code $f: $(head -n 1 /tmp/guard-pay.$$ | cut -c1-100)"
  fi
  # A quoted run of 13 to 19 digits looks like a card number (test card numbers belong in the processor documentation).
  if grep -InE "['\"][0-9]{13,19}['\"]" "$f" > /tmp/guard-pay.$$ 2>/dev/null; then
    fail "card-number-like literal in payment code $f: $(head -n 1 /tmp/guard-pay.$$ | cut -c1-100)"
  fi
  if grep -InEi '\bluhn\b|autoComplete=.cc-|inputMode=.numeric. [^>]*maxLength=.(15|16|19)' "$f" > /tmp/guard-pay.$$ 2>/dev/null; then
    fail "card field logic in payment code $f: $(head -n 1 /tmp/guard-pay.$$ | cut -c1-100)"
  fi
  if [ "$f" != "lib/payment/csp.ts" ] && grep -InE 'google-analytics|googletagmanager|hotjar|clarity\.ms|fullstory|mouseflow|segment\.com|connect\.facebook' "$f" > /tmp/guard-pay.$$ 2>/dev/null; then
    fail "analytics or behaviour script host in payment code $f: $(head -n 1 /tmp/guard-pay.$$ | cut -c1-100)"
  fi
done < <(files_matching '\.(ts|tsx)$' | grep -E "$payment_paths")
rm -f /tmp/guard-pay.$$
finish
