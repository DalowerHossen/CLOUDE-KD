# PayPal - verification record

Date: 2026-10-17. Two layers:

## A. Local checks (run, passing)
`npx tsx --conditions=react-server scripts/verify/step11-paypal.ts` -> 14 checks passed. A fake HTTP transport answers with the shapes of PayPal's OpenAPI specifications and documentation (docs/processors/paypal.md). It proves:
- checkout session: the order is created on the server with `intent: AUTHORIZE`, `custom_id` = invoice, the exact USD value with two decimals, the 3DS verification method, `PayPal-Request-Id`; both token requests use the documented form bodies; sandbox and live hosts; no secret in the client data;
- authorize: the order is read first and must carry the server's amount, currency and invoice (otherwise nothing is authorized); PayPal's 3DS table decides whether to continue (12 enrollment/status/liability combinations); an authorization that already exists is returned instead of being repeated; identity `bin|last4|expiry|brand`; AVS code to postal result;
- declines by processor response code (14 codes -> the platform categories) and by 422 issue (`INSTRUMENT_DECLINED`, `CARD_EXPIRED`, `ORDER_ALREADY_AUTHORIZED`);
- capture (final capture, amount), declined capture, void (also "already voided"), full/partial/pending/refused refund (capture id read from the order), status lookup including `PAYER_ACTION_REQUIRED`, id validation;
- credentials: 401 on the token, outages (5xx throw), permissions (403), missing secret; token reuse; connection test success, wrong webhook id, wrong credentials (no secret in the message);
- webhooks: postback verification with the raw event posted unchanged and the five transmission headers; `FAILURE`, 500, stale and future time, certificate address of another host or over http, missing header, invalid JSON, missing webhook id all refuse **without** calling PayPal; mapping of the nine event types, order id from `related_ids`, disputes with no order id.

## B. Sandbox scenarios (NOT run: no PayPal sandbox credentials in this environment)
Nothing below is claimed as passed. With a sandbox business account, a REST app (client id, secret), a webhook subscribed to the platform URL (webhook id) and the Expanded Checkout card payments feature enabled, run these and record the order ids here:

| Scenario | Test data | Expected | Result |
|---|---|---|---|
| credentials test success / failure | valid / wrong secret; wrong webhook id | ok / message without the secret / "webhook id does not belong" | pending |
| success + capture | Visa 4012888888881881 | authorized then captured | pending |
| declines | name on card `CCREJECT-IF`, `-EC`, `-IRC`, `-LS`, `-SF`, `-REFUSED`, `-CVV_F`, `-IA`, `-BANK_ERROR` | `insufficient_funds`, `invalid_expiry`, `invalid_number`, `processor_fraud_signal` (x2), `do_not_honor`, `invalid_cvv`, `invalid_number`, `do_not_honor`; check whether PayPal answers HTTP 201 `DENIED` or 422 | pending |
| 3DS pass (frictionless / step-up) | cards of the 3DS test scenarios page, cases 1 and 7 | captured, `threeDS.authenticated` true | pending |
| 3DS fail | cases 2 and 8 | `three_ds_failed`, no authorize call | pending |
| 3DS unavailable | case 6 | continues; goes to review unless postal and country match | pending |
| no-3DS mismatch review | wrong postal code | `pending_review`, no capture | pending |
| void | authorize then void from the review page | `voided` | pending |
| partial and full refund | 25, then the rest | `partially_refunded`, `refunded` | pending |
| webhook valid / invalid | event from the Dashboard (not the simulator: the simulator's mock events cannot be verified by postback) | processed / refused 401 + security event | pending |
| duplicate webhook | resend the same event | processed once | pending |
| order status after submit | observe | `APPROVED` expected | pending |
| expired order (3 hours) | wait | normal payment failure; reload creates a new order | pending |
