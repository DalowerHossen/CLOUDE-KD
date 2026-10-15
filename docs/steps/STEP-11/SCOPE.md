# STEP 11 - Payment Processor Adapters, Group 1

Wave D. Depends on: `types/contracts/payment-adapter.ts` (STEP 01) and the framework from STEP 10 (webhook core, registry, card rules, verification). Builds eight adapters, one file each.

Processors in this STEP, in order: **stripe, paypal, braintree, square, authorizenet, bluesnap, verifone, payarc**.

## Mandatory reading before any code
`docs/execution/PAYMENT_PROCESSORS.md` (all sections) and `docs/execution/REQUIREMENTS_SPEC.md` (REQ-DOC, REQ-CARD, REQ-VERIFY). For each processor: the official documentation from the internet, read in the current session (REQ-DOC). A fresh chat per processor is allowed: use the resume message with the processor id.

## Feature sources
- Part 4 lines 1537-1622 (A2 Stripe, A3 PayPal, A4 Paddle (STEP 12), A5 NMI (STEP 12), A6 Rapyd (STEP 12), A7 Adyen (STEP 12), A8 custom (STEP 12)); use the sub-sections for Stripe and PayPal as capability hints only; the official documentation decides the real behaviour.
- Part 4 lines 1669-1731 (payment flow, refunds), 1869-1932 (H chargeback and dispute handling data hooks), 1973-1997 (fraud and audit)

## Owned paths
OWNERSHIP_MAP.md row 11. No migrations (tables belong to STEP 10). Every processor writes only its own files.

## Sub-steps (the pattern repeats for each processor; ids 11.k.a to 11.k.e)
For processor number k in {1 stripe, 2 paypal, 3 braintree, 4 square, 5 authorizenet, 6 bluesnap, 7 verifone, 8 payarc}:
- 11.k.a DOC-READ - official docs and sandbox facts into `docs/processors/<id>.md` (template in PAYMENT_PROCESSORS.md section 4). Commit.
- 11.k.b ADAPTER - `lib/payment/adapters/<id>.ts` implementing the full contract (credentials fields, testConnection, authorize, capture, void, refund, status lookup, 3DS handling, card identity, decline mapping, webhook verify and parse, capabilities). Commit.
- 11.k.c WEBHOOK - `app/api/webhooks/<id>/route.ts` using the STEP 10 webhook core. Commit.
- 11.k.d SECURE FORM - `components/payment/processors/<id>/` using the processor's own hosted fields, iframe or redirect. No card data in our code. No behaviour tracking. Commit.
- 11.k.e VERIFY - run the official sandbox scenarios and record them in `docs/processors/<id>.verify.md`: success, each decline category, 3DS success and failure, webhook with valid and invalid signature, duplicate webhook, partial and full refund, void, credentials test success and failure. Commit.

Processor-specific notes (confirm against the official documentation):
- stripe: Payment Intents and Payment Elements or hosted fields; card fingerprint as identity.
- paypal: Orders API v2 and standalone card fields; capture and authorize intents.
- braintree: documentation under the PayPal developer site; Drop-in or hosted fields; vault token or fingerprint for identity.
- square: Web Payments SDK; sandbox accounts.
- authorizenet: Accept.js or Accept Hosted; sandbox keys.
- bluesnap: Hosted Payment Fields; test mode page must be found through the agent index (the old link returns 404).
- verifone: 2Checkout/Verifone documentation and development-partner sandbox.
- payarc: Payarc / PaymentCloud docs; find and record the sandbox.

## Closing sub-step
- 11.9 Status table: add one row per processor to the generated status file by running `scripts/gen-processor-status.sh` (reads `docs/processors/*.md` and `*.verify.md`); no hand edits to shared files. Write the HANDOFF listing each processor, its modes, capabilities and any limitation found in the official documents.

## Security notes
Webhooks without a valid signature are rejected. Secrets are read from the credential vault only inside the call and never logged. Idempotency key sent whenever the processor supports one. Sandbox and live credentials are never mixed.

## Verification
Per processor: its `.verify.md` shows every scenario passed with transaction ids from the sandbox; the super admin page can add credentials, test, enable and disable the processor; no `any`, no console, no card field names in the processor's files (guards pass).

## Handoff must list
For each of the eight processors: documentation date, sandbox access method, capability flags, card identity strategy, webhook events, known limits.
