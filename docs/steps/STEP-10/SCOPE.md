# STEP 10 - Payment Core and Super Admin Processor Connect

Wave C. Depends on: STEPs 01 to 05 contract implementations (auth step-up, security, encryption, audit); consumes `invoices` and `clients` through contracts. Provides contract: payments. Builds the framework that STEP 11 and STEP 12 plug adapters into.

## Feature sources
- Part 4 lines 1517-1535 (A1 gateway architecture), 1623-1631 (B1 payout partner framework: naming only), 1669-1731 (C payment flow, records, receipts data, refunds, partial payments, surcharges), 1732-1785 (D payment links, hosted checkout, pluggable integration), 1786-1827 (E wallet pay options only), 1973-2011 (L fraud prevention, audit, M payment reports)
- Part 9 lines 3971-3981 (I webhook security), 4203-4239 (R2 payment edge cases)
- Part 11 lines 4554-4573 (payment fraud engine)
- MASTER_PROMPT: concurrent payment guard, payment and webhook duplicate detection, PCI approach
- REQUIREMENTS_SPEC: REQ-PROCESSORS, REQ-NMI-MODES (framework), REQ-ADMIN-CONNECT, REQ-CARD, REQ-VERIFY
- docs/execution/PAYMENT_PROCESSORS.md

## Owned paths and migrations
OWNERSHIP_MAP.md rows 10 and section 4. Migration block `S10_*`. Config files `config/processors.ts` and `config/payment-risk.ts`.

## Sub-steps
- 10.1 Payment schema: processors, credentials, modes, mode tests, routing rules, payments, attempts, allocations, refunds, links, webhook events (unique processor + event id), card identities, blacklist, reviews.
- 10.2 Registry and adapter framework: `config/processors.ts` (all 16 with links from PAYMENT_PROCESSORS.md), `lib/payment/registry.ts`, `adapters/base.ts`, normalized decline mapping, capability checks, generated adapters index consumed at runtime, credential form generated from `credentialFields`.
- 10.3 Credential vault (`lib/payment/credentials.ts`): encrypt through the encryption contract (purpose `processor-credentials`), store ciphertext, iv, tag, key version, last characters, updated time, updated by; never return secrets; versioning; automatic disable on change.
- 10.4 Super admin page and API (REQ-ADMIN-CONNECT): list, enter credentials, test, enable, disable, environment (sandbox or live), step-up on every write, audit entries, refusal for processors without adapter, refusal to enable without a passing test.
- 10.5 Mode framework (`lib/payment/modes.ts`): one active mode per processor, `processor_modes`, `processor_mode_tests`, switch only after a passing test in the target mode, audit on every change, UI on the processors page.
- 10.6 Routing (`lib/payment/routing.ts`): rule model (amount range, country, method, company plan, priority), evaluation, no match -> cancel with `routing_no_match`, no failover; admin UI for rules.
- 10.7 Payment orchestration (`services/payment/`): required Idempotency-Key, state machine (created, requires_action, authorized, captured, failed, pending_review, voided, refunded), authorize then capture, invoice updates through the invoices contract, partial payments and allocations, refunds with policy and approval, Money everywhere, events `payment.*`.
- 10.8 Card rules engine (`lib/payment/card-rules.ts`, REQ-CARD): identity hashing with HMAC, same-card-same-invoice window, counted-failure rule with insufficient-funds excluded, blacklist, velocity limits per card and per IP, all numbers from `config/payment-risk.ts`.
- 10.9 Verification engine (`lib/payment/verification.ts`, REQ-VERIFY): 3DS request policy, postal and IP-country comparison against the `invoices` contract data, network check with context `payment`, review queue creation, hold and expiry job, admin page `(admin)/payments/review` (capture or void with audit, roles payment_processor and fraud_analyst).
- 10.10 Webhook core (`services/payment/webhook-core.ts`): verify through adapter, reject and raise security event on failure, dedupe on unique key, idempotent processing, dead-letter list, viewer in admin.
- 10.11 Checkout and links: payment links, hosted checkout shell with the secure-form slot (`components/payment/checkout-slot.tsx` loads the active processor's component), payment-page CSP profile, refund policy display, receipts data, dashboard `(dashboard)/payments` list and detail, payment reports and gateway health.
- 10.12 Checks: `scripts/check-no-pan.sh` extended rules for payment paths, `sql/assertions/s10_*.sql` (unique webhook events, no plaintext credentials column, numeric(18,4) money columns). End-to-end verification of the framework runs with the first real adapter from STEP 11 after the Integrator merges both; until then only the static checks and SQL assertions apply.

## Security notes
Secrets in memory only for the duration of one call. Credential rows are inaccessible to every role except the server service role. Card data never touches this STEP's code. All statuses and amounts come from the processor result and the invoices contract, never from the browser.

## Verification
With any one adapter from STEP 11 present: credentials save then display only last characters; test fails -> cannot enable; credentials change -> auto disabled; unknown processor id -> refused; no routing match -> payment cancelled with `routing_no_match` and no call to any processor; second card payment on the same invoice within 24 hours refused; third counted failure refused; insufficient funds not counted; mismatch of postal code or IP country without 3DS -> review queue and no capture; invalid webhook signature rejected; duplicate webhook processed once.

## Handoff must list
Adapter contract final shape, routing rule fields, review queue states, env keys, config keys.
