# STEP 11 - Sub-steps plan

Branch `claude/clever-goldberg-8ncdae`. No migrations (tables belong to STEP 10). Each processor writes only its own files (OWNERSHIP_MAP row 11). Before any adapter code, the official documentation is read in the current session (REQ-DOC) and recorded in `docs/processors/<id>.md`. If a site cannot be reached, the sub-step stops and is reported.

Framework used from STEP 10: `lib/payment/adapters/base.ts` (`defineAdapter`, `buildTransaction`, `safeEqual`), `lib/payment/webhook-route.ts` (`processorWebhookRoute`), `components/payment/secure-form-types.ts` (`SecureFormComponent`), `config/processors.ts` (`PROCESSOR_ORIGINS`), `config/payment-risk.ts` (`AUTH_VALIDITY_HOURS_BY_PROCESSOR`), `lib/webhook/signature.ts` (HMAC helpers). Idempotency keys come from the core. Security checks for all: Z6 (no secret in logs), Z7, Z12 (signature first), no card data, no tracking.

Pattern for processor k (id order below), each ending in one commit:
- 11.k.a DOC-READ: `docs/processors/<id>.md` (template of PAYMENT_PROCESSORS section 4). Commit `docs(step11): 11.k.a <id> documentation record`.
- 11.k.b ADAPTER: `lib/payment/adapters/<id>.ts` (+ folder helpers), fields, testConnection, session, authorize, capture, void, refund, getTransaction, 3DS, identity, decline map, webhook verify and parse. Also updates `PROCESSOR_ORIGINS`/`AUTH_VALIDITY_HOURS_BY_PROCESSOR` entries and runs `npm run gen`.
- 11.k.c WEBHOOK: `app/api/webhooks/<id>/route.ts` = `processorWebhookRoute('<id>')`.
- 11.k.d SECURE FORM: `components/payment/processors/<id>/index.tsx` (default export `SecureFormComponent`).
- 11.k.e VERIFY: `scripts/verify/step11-<id>.ts` (adapter against recorded request/response shapes with a local fake HTTP server, signature vectors from the documentation) and `docs/processors/<id>.verify.md`. Scenarios against the real sandbox need sandbox credentials, which this environment does not have; they are listed as pending and never recorded as passed.

Order: 11.1 stripe, 11.2 paypal, 11.3 braintree, 11.4 square, 11.5 authorizenet, 11.6 bluesnap, 11.7 verifone, 11.8 payarc, then 11.9 status table (`scripts/gen-processor-status.sh`) and HANDOFF.
