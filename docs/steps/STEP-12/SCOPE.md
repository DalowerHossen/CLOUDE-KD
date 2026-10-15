# STEP 12 - Payment Processor Adapters, Group 2 (includes NMI two modes)

Wave D. Depends on: `types/contracts/payment-adapter.ts` (STEP 01) and the framework from STEP 10. Builds eight adapters, one file each.

Processors in this STEP, in order: **nmi, adyen, paddle, fastspring, payproglobal, payoneer, rapyd, custom**.

## Mandatory reading before any code
`docs/execution/PAYMENT_PROCESSORS.md` and `docs/execution/REQUIREMENTS_SPEC.md` (REQ-DOC, REQ-NMI-MODES, REQ-CARD, REQ-VERIFY). For each processor read the official documentation from the internet in the current session. A fresh chat per processor is allowed.

## Feature sources
- Part 4 lines 1567-1622 (A4 Paddle, A5 NMI, A6 Rapyd, A7 Adyen, A8 custom adapter) as capability hints only; official documentation decides behaviour
- Part 4 lines 1623-1668 (B payout partner framework hooks relevant to Payoneer and Rapyd), 1933-1972 (J subscription and BNPL capability hooks relevant to Paddle, FastSpring, PayPro Global)

## Owned paths
OWNERSHIP_MAP.md row 12. No migrations. Every processor writes only its own files.

## Sub-steps
Same pattern as STEP 11 (a DOC-READ, b ADAPTER, c WEBHOOK, d SECURE FORM, e VERIFY) for each processor, ids 12.k.a to 12.k.e, k = 1 nmi, 2 adyen, 3 paddle, 4 fastspring, 5 payproglobal, 6 payoneer, 7 rapyd, 8 custom.

### NMI (12.1) - two front-end modes (REQ-NMI-MODES)
- 12.1.a DOC-READ from https://docs.nmi.com/ using the agent index https://docs.nmi.com/llms.txt, Collect.js page, sandbox page; record both modes, token lifetime (single use, expires after 24 hours), REST API operations, webhook signature, 3DS, decline codes.
- 12.1.b SHARED SERVER MODULE `lib/payment/adapters/nmi/shared-server.ts`: one module used by both modes to send the payment from the server to the NMI REST API. Mode-specific code only prepares the token.
- 12.1.c ADAPTER `lib/payment/adapters/nmi.ts` with `modes: [collectjs (default), payment_component]`, exposing the active mode to the STEP 10 mode framework.
- 12.1.d MODE COMPONENTS: `components/payment/processors/nmi/collectjs/` (default) and `components/payment/processors/nmi/payment-component/`. The Payment Component needs an npm package: write the request in `docs/steps/STEP-12/DEPENDENCY_REQUESTS.md` (package name and exact version taken from the official documentation) and stop that part until the Integrator reports it installed. Collect.js work does not wait.
- 12.1.e MODE TESTS: a test action per mode usable by the STEP 10 mode switch (`testConnection(credentials, env, mode)`); both modes verified in the sandbox; token reuse and token expiry behaviour recorded.
- 12.1.f WEBHOOK `app/api/webhooks/nmi/route.ts`, VERIFY record `docs/processors/nmi.verify.md` covering both modes.

### Other processors (confirm everything against the official documentation)
- adyen: Checkout API and Drop-in or Components; Adyen testing page; HMAC webhook verification.
- paddle: Paddle Billing; sandbox per developer docs; merchant-of-record behaviour flagged in capabilities (`isMerchantOfRecord`).
- fastspring: API overview; find and record the sandbox method; merchant-of-record flag.
- payproglobal: API overview; find and record the sandbox method; merchant-of-record flag.
- payoneer: API reference and developer portal; capability may be payout-focused: record exactly which operations the official documentation supports and set capabilities accordingly (`supportsPayout`); an operation the processor does not support is not simulated.
- rapyd: Collect and payout APIs; find and record the sandbox.
- custom: generic adapter for an owner-defined HTTPS gateway; configuration-driven (base URL, auth header scheme, request and response field mapping, signature scheme for webhooks); no provider-specific behaviour; SSRF guard on the configured host; test endpoint required before enable.

## Closing sub-step
- 12.9 Run `scripts/gen-processor-status.sh`, write HANDOFF with all eight processors' limits and any package requests.

## Security notes
Same as STEP 11, plus: the custom adapter allows only HTTPS to public hosts, validates redirects, and signs nothing it cannot verify.

## Verification
Per processor: `.verify.md` complete. NMI: switching mode from the super admin page is refused until the target mode has a passing test, accepted afterward, only one mode active, audit entry written, both modes complete a sandbox payment through the same shared server module.

## Handoff must list
Same as STEP 11, plus the NMI package request status.
