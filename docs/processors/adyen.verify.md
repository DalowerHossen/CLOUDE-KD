# Adyen - verification record

Date: 2026-10-18. Two layers:

## A. Local checks (run, passing)
`npx tsx --conditions=react-server scripts/verify/step12-adyen.ts` -> 9 checks passed. A fake HTTP transport answers with the shapes of Adyen's Checkout API v71 (docs/processors/adyen.md). It proves:
- contract: one-step card sale (`charge` present, no capture or void), USD only, credential field patterns;
- session: the exact `POST /v71/sessions` body (cards only, redirect-flow 3DS, invoice reference and metadata), `x-api-key` and hashed `idempotency-key` headers, test and live hosts (the live host built from the URL prefix); only public data reaches the browser (session id and data, client key, environment, amount, the fixed 6.46.0 script and stylesheet addresses and their integrity hashes); a refused request (code shown), a missing session data, missing client key, merchant account, country or live prefix, 401 and 5xx are refused;
- `charge` and `authorize` read the session result (`GET /v71/sessions/{id}?sessionResult=...`, the proof URL-encoded): completed, reference equal to the invoice, one authorised USD payment for the invoice amount, a 16 character `pspReference` as the transaction id, card identity from the additional data; pending, canceled, refused, another reference, another amount, another currency, not authorised, a malformed payment reference, another session id and an unknown session are refused; malformed tokens are rejected before any call;
- refund: the exact asynchronous request (reference derived from the platform key), `received` reported as pending with the refund's own reference, an API error as declined with its code, a malformed payment reference rejected, and `getTransaction` refusing with its documented reason;
- decline mapping for the documented refusal codes and the connection test (accepted on an error for the unknown session, 401 without the key text, 5xx);
- webhooks: the documented example data string, then the signature recomputed independently from the documented steps (hexadecimal key to bytes, colon-joined fields, Base64); a missing signature, a wrong key, a changed amount, one forged item among several, an empty item list, bad JSON, an empty body and a malformed key are refused; event mapping for authorisation (success and failure), failed capture, refund, cancellation, expiry, chargebacks, unrelated events, and the first known item of a multi-item delivery.

## B. Sandbox scenarios (NOT run: no Adyen credentials in this environment)
Nothing below is claimed as passed. With an Adyen test account (API key, client key with the platform origin allowed, merchant account, webhook HMAC key) run these and record the ids here:

| Scenario | Test data | Expected | Result |
|---|---|---|---|
| credentials test success / failure | valid / wrong key | ok / message without the key | pending |
| session created | USD invoice 1.50 | `id` and `sessionData`; no non-card methods shown | pending |
| Drop-in renders | script with the fixed integrity hashes | card form shown; no integrity error; CSP violations recorded (section 12a) | pending |
| payment completes | card 4111 1111 4555 1142, 03/2030, 737 | `onPaymentCompleted` with `sessionResult`; `charge` returns `captured`; amount and reference match | pending |
| 3DS | a 3DS 2 card from the test cards page | redirect flow completes; payment authorised | pending |
| refusals | cards or values from "Testing result codes" | `onPaymentFailed`; refusal codes recorded | pending |
| immediate capture | authorised test payment | `CAPTURE` webhook arrives; no manual capture needed | pending |
| refund whole / part | authorised payment | `received`, then a `REFUND` webhook; payment marked refunded | pending |
| webhook valid / invalid | `AUTHORISATION`; a forged copy | processed / 401 + security event | pending |
| duplicate webhook | resend | processed once (event code and `pspReference`) | pending |
| chargeback | test chargeback if offered | `dispute.opened` with the payment reference | pending |

## C. Known limits
- Adyen has no call that reads a payment back, so `getTransaction` is unavailable: a payment that stays pending after the browser step cannot be resumed (request R3). Card payments with immediate results do not need it.
- Capture is automatic; a failed capture is only seen as a `CAPTURE_FAILED` webhook (mapped to failed, ignored for a payment already booked).
- Refunds are asynchronous; the refund is `pending` until the `REFUND` webhook.
- The session result's card details need the matching additional data enabled in the Customer Area; without it the card identity is empty.
- Only the default live endpoint is supported; location-based endpoints need region-specific hosts.
- The browser version is fixed (6.46.0) with its Subresource Integrity hashes; an upgrade needs new hashes from the release notes.
- Drop-in's own content security policy hosts are not documented on the pages read.
