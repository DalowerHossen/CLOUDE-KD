# Stripe - verification record

Date: 2026-10-17. Two layers:

## A. Local checks (run, passing)
`npx tsx --conditions=react-server scripts/verify/step11-stripe.ts` -> 13 checks passed. A fake HTTP transport answers with response shapes taken from the Stripe documentation (docs/processors/stripe.md). It proves:
- request building: URL, Basic auth, `Stripe-Version`, `Idempotency-Key`, form encoding, minor units, `capture_method=manual`, `confirmation_token`, 3DS request mapping (`any`, `challenge`, `automatic`), `expand[0]=latest_charge`;
- result mapping: authorized, captured, pending, voided, `requires_action` (redirect and SDK challenge with the client secret), authentication result (only `authenticated` counts), postal-code check, card fingerprint as identity (also from the error object of a declined payment);
- declines: `insufficient_funds`, `incorrect_cvc`, `expired_card`, `incorrect_number`, `generic_decline`, `fraudulent`, `processing_error`, `authentication_required`, and the code-only form;
- capture, void, full and partial refund, pending refund, refused refund, status lookup, id validation;
- refusals: key not accepted (401), outages (429, 5xx throw), sandbox key with live environment and the reverse (no request is sent);
- connection test success and failure (no key in the message), checkout session data (no secret in it);
- webhook signature: valid, stale (over 300 s), future, wrong secret, tampered body, missing or malformed header, `v0` only, several `v1` values, tolerance 0 refused; event mapping for the nine event types and dispute outcomes; duplicate handling is done by the core (`step10-flow.ts`).

## B. Sandbox scenarios (NOT run: no Stripe sandbox keys in this environment)
Nothing below is claimed as passed. Run with a Stripe sandbox (Dashboard sandbox, or `stripe sandbox create`) using the test data of docs/processors/stripe.md section 11 and record the PaymentIntent ids here:

| Scenario | Test data | Expected | Result |
|---|---|---|---|
| credentials test success / failure | valid key / wrong key | ok / message without the key | pending |
| success + capture | 4242 4242 4242 4242 | authorized then captured | pending |
| decline: insufficient funds | 4000000000009995 | `insufficient_funds`, not counted | pending |
| decline: incorrect CVC | 4000000000000127 | `invalid_cvv`, counted | pending |
| decline: expired card | 4000000000000069 | `invalid_expiry`, counted | pending |
| decline: incorrect number | 4242424242424241 | `invalid_number`, counted | pending |
| decline: processing error | 4000000000000119 | `processor_error`, not counted | pending |
| 3DS pass | 4000002760003184, complete the challenge | captured, `threeDS.authenticated` true | pending |
| 3DS fail | 4000002760003184, fail the challenge | `three_ds_failed`, counted | pending |
| no-3DS mismatch review | card without 3DS, wrong postal code | `pending_review`, no capture | pending |
| void | authorize then void from the review page | `voided` | pending |
| partial and full refund | refund 25 then the rest | `partially_refunded`, `refunded` | pending |
| webhook valid / invalid signature | Stripe CLI or Dashboard test event | processed / 401 + security event | pending |
| duplicate webhook | resend the same event | processed once | pending |
| next_action type for card 3DS | observe | handled as redirect or SDK action | pending |
