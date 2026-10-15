# PAYMENT PROCESSORS (16) - registry, documentation rule, adapter contract

## 1. Rule (REQ-DOC)

In STEP 10, 11 and 12, before the first line of code for a processor, open the processor's own website in the current session and read the latest official documentation (WebFetch/WebSearch). The links below are starting points. Verify each one on the provider's own site. Write the facts into `docs/processors/<id>.md`, commit that file, and only then write the adapter. Never rely on memory.

## 2. The sixteen processors

| # | id | Name | STEP | Documentation | Sandbox / testing |
|---|---|---|---|---|---|
| 1 | stripe | Stripe | 11 | https://stripe.com/docs/api | https://stripe.com/docs/testing |
| 2 | nmi | NMI | 12 | API https://docs.nmi.com/ ; Collect.js https://docs.nmi.com/docs/collectjs ; agent index https://docs.nmi.com/llms.txt | https://docs.nmi.com/docs/testing-sandbox |
| 3 | adyen | Adyen | 12 | https://docs.adyen.com/ | https://docs.adyen.com/development-resources/testing/ |
| 4 | verifone | Verifone (2Checkout) | 11 | https://docs.verifone.com/ | https://www.verifone.com/development-partner |
| 5 | braintree | Braintree (PayPal) | 11 | https://developer.paypal.com/braintree/docs | https://developer.paypal.com/braintree/help/sandboxHelp |
| 6 | bluesnap | BlueSnap | 11 | https://developers.bluesnap.com/ ; agent index https://developers.bluesnap.com/llms.txt | Test mode: NOT https://developers.bluesnap.com/docs/test-mode (returns 404). Find the correct test-mode page through the agent index. |
| 7 | square | Square | 11 | https://developer.squareup.com/docs | https://developer.squareup.com/docs/testing/sandbox |
| 8 | payoneer | Payoneer | 12 | https://developer.payoneer.com/docs/payoneer-api-reference ; portal https://developer.payoneer.com/ | Not provided in the brief. Find it in the Payoneer docs and record it. |
| 9 | fastspring | FastSpring | 12 | https://developer.fastspring.com/reference/api-overview | Not provided. Find it in the FastSpring docs and record it. |
| 10 | paddle | Paddle | 12 | https://developer.paddle.com/ | https://developer.paddle.com/sdks/sandbox/ |
| 11 | payproglobal | PayPro Global | 12 | https://developers.payproglobal.com/docs/api/overview/ | Not provided. Find it in the PayPro Global docs and record it. |
| 12 | paypal | PayPal (standalone) | 11 | https://developer.paypal.com/api/rest/ | https://developer.paypal.com/sandbox-testing/overview |
| 13 | payarc | Payarc / PaymentCloud | 11 | https://docs.payarc.net/ | Not provided. Find it in the Payarc docs and record it. |
| 14 | rapyd | Rapyd | 12 | https://docs.rapyd.net/ | Not provided. Find it in the Rapyd docs and record it. |
| 15 | authorizenet | Authorize.Net | 11 | https://developer.authorize.net/api/reference/index.html | Sandbox https://developer.authorize.net/hello_world/sandbox.html ; testing guide https://developer.authorize.net/hello_world/testing_guide.html |
| 16 | custom | Custom | 12 | Generic adapter for an owner-defined HTTPS gateway. No provider-specific behaviour is hardcoded. | Owner-defined test endpoint |

STEP 11 builds: stripe, paypal, braintree, square, authorizenet, bluesnap, verifone, payarc. STEP 12 builds: nmi (first), adyen, paddle, fastspring, payproglobal, payoneer, rapyd, custom.

## 3. File layout

```
config/processors.ts                        metadata of all 16 (id, name, links, adapter file, steps)  [STEP 10]
lib/payment/registry.ts                     lists all 16; resolves the adapter through the generated index  [STEP 10]
lib/payment/adapters/base.ts                re-exports the contract types  [STEP 10]
lib/payment/adapters/index.generated.ts     generated from files present in lib/payment/adapters  [Integrator]
lib/payment/adapters/<id>.ts                one adapter per file, exports `adapter`  [STEP 11 or 12]
lib/payment/adapters/<id>/                  optional helpers for that adapter only
app/api/webhooks/<id>/route.ts              webhook entry for that processor
components/payment/processors/<id>/         secure-form component for that processor
docs/processors/<id>.md                     documentation record (template below)
docs/processors/<id>.verify.md              sandbox verification record
```

The dashboard lists a processor only when the registry finds its adapter in the generated index.

## 4. Documentation record template (`docs/processors/<id>.md`)

1. Sources read: every URL, and the date and time read.
2. Authentication scheme and credential fields (names only, no secrets).
3. Environments: sandbox and production base URLs; how the sandbox is obtained.
4. Hosted/secure card form product used and why; how the token is created; token lifetime and reuse rules.
5. Operations used: authorize, capture, void, sale, refund, status lookup, with endpoints and required fields.
6. 3D Secure support and how it is requested; liability shift signal.
7. Card identity strategy for REQ-CARD (processor fingerprint or vault token).
8. Decline code mapping to `DeclineCategory`.
9. Webhooks: events used, signature scheme, replay window, retry behaviour, event id field.
10. Idempotency support (header or field).
11. Test cards and sandbox scenarios taken from the official page.
12. Limits, currencies, capabilities (`ProcessorCapabilities`).
13. Open questions (must be empty before the adapter is committed).

## 5. Adapter contract (type file `types/contracts/payment-adapter.ts`, created in STEP 01)

- `ProcessorId`: union of the 16 ids.
- `ProcessorCapabilities`: `supportsAuthCapture`, `supportsThreeDS`, `supportsRefund`, `supportsPartialRefund`, `supportsRecurring`, `supportsPayout`, `isMerchantOfRecord`, `modes` (list of `ProcessorMode`), `currencies`.
- `ProcessorMode`: `{ id: string, label: string, isDefault: boolean }`. Example for NMI: `collectjs` (default) and `payment_component`.
- `CredentialField`: `{ key, label, secret: boolean, required, validation }`. The dashboard form is generated from it.
- `DeclineCategory`: `insufficient_funds | invalid_number | invalid_expiry | invalid_cvv | otp_failed | three_ds_failed | processor_fraud_signal | do_not_honor | processor_error | other`.
- `ProcessorAdapter` operations: `credentialFields`, `testConnection(credentials, env, mode)`, `createCheckoutSession(...)`, `authorize(...)`, `capture(...)`, `voidAuthorization(...)`, `charge(...)` (single step, only if no auth/capture), `refund(...)`, `getTransaction(...)`, `verifyWebhook(request, credentials)` -> verified event or error, `parseWebhook(event)` -> normalized event, `cardIdentity(result)` -> `{ type: 'fingerprint' | 'token', value }`, `mapDecline(raw)` -> `DeclineCategory`, `evidenceFormat?(dispute)`.
- All amounts are `Money`. All calls take an idempotency key.
- Adapters never log request bodies that can contain secrets. Adapters never receive card numbers.

## 6. Adapter sub-step pattern (used in STEP 11 and STEP 12 for every processor)

- a. DOC-READ: read the official docs (REQ-DOC), write `docs/processors/<id>.md`, commit `docs(stepNN): NN.k <id> documentation record`.
- b. ADAPTER: write `lib/payment/adapters/<id>.ts` (+ helpers), implementing the contract fully. Commit.
- c. WEBHOOK: `app/api/webhooks/<id>/route.ts` using the STEP 10 webhook core (signature, dedupe, idempotent processing). Commit with b or separately.
- d. SECURE FORM: `components/payment/processors/<id>/` for the processor's own card form, no card data in our code, no behaviour tracking. Commit.
- e. VERIFY: run the sandbox scenarios from the official testing page and record results in `docs/processors/<id>.verify.md`: success, decline categories, 3DS pass and fail, webhook valid and invalid signature, duplicate webhook, refund, void. Commit.

A fresh chat may be used per processor. The resume message names the processor id.
