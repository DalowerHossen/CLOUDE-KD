# Adyen - documentation record

## 1. Sources read
Read on 2026-10-18 (UTC) from Adyen's own documentation site https://docs.adyen.com (every page as Markdown by appending `.md`; the index is https://docs.adyen.com/llms.txt; the host was unreachable in the first session and is reachable now). Pages: Sessions flow integration guide (Web Drop-in), Capture, Cancel, Refund, Live endpoints, Web best practices, Release notes (Web, with the Subresource Integrity hashes), Webhook structure and types, Handle webhook events, Verify HMAC signatures, Test card numbers, Testing result codes, Refusal reasons, 3D Secure overview. The Checkout API v71 OpenAPI file (`Adyen/adyen-openapi`) and the Node library's HMAC validator were read for exact field names.
Not read: the Content Security Policy requirements of Drop-in (no page found), the 3DS 2 test scenarios, the Customer Area screens for creating the API key and client key.

## 2. Authentication and credential fields
Checkout API: header `x-api-key: <API key>` (Basic auth is also defined; not used), `content-type: application/json`, optional `idempotency-key`. Requests carry `merchantAccount`. Credential fields (names only): `apiKey` (secret), `clientKey` (public key for the browser; the client key must list the platform origin), `merchantAccount`, `hmacKey` (secret; the hexadecimal key of the webhook), `countryCode` (two letters; the shopper country the Drop-in needs, used for the session and the browser), `livePrefix` (the live URL prefix from Developers, API URLs; required for the live environment only). Amounts are `{ value (integer minor units), currency }`.

## 3. Environments
Test: `https://checkout-test.adyen.com/v71`. Live: `https://[prefix]-checkout-live.adyenpayments.com/checkout/v71` with the company's live URL prefix. Location-based live endpoints (other regions) need region-specific hosts and Drop-in `environment` values that were not read; the adapter supports only the default live endpoint. Browser script and stylesheet: version 6.46.0 (released 2026-09-28) from `https://checkoutshopper-test.cdn.adyen.com/checkoutshopper/sdk/6.46.0/` (test) or `https://checkoutshopper-live.cdn.adyen.com/checkoutshopper/sdk/6.46.0/` (live), files `adyen.js` and `adyen.css`; the same Subresource Integrity hashes apply to both hosts: JS `sha384-BWFAwV8ndpuOuMAiAu2fKA0Vj2lSBNRCVBKIV2K7G6hRT7+0CaXiFYZxkDgfwY7r`, CSS `sha384-iqhFsakyeWB88YbaGEhZMvY6gJnakKalS52WEM1jya1sN8udUMNyKpfouOSmYVy/`. This removes the need for the npm package (request R2 is withdrawn). A new version needs its hashes from the release notes.

## 4. Secure form
Sessions flow, Web Drop-in v6. The server creates a session; the browser creates `AdyenCheckout({ environment: 'test' | 'live', clientKey, countryCode, locale: 'en-US', amount, session: { id, sessionData }, onPaymentCompleted, onPaymentFailed, onError })` from `window.AdyenWeb`, then `new Dropin(checkout, {}).mount('#dropin')`. The card fields are Adyen's own. Drop-in shows its own pay button. `onPaymentCompleted(result)` carries `result.sessionResult`; the form hands the platform the token `<sessionId>.<sessionResult>`. 3D Secure runs inside Drop-in; the session asks for the redirect flow (`authenticationData.threeDSRequestData.nativeThreeDS: "disabled"`) so that no Content Security Policy change is needed for 3DS interfaces.

## 5. Operations
- Create the payment: `POST /sessions` `{ merchantAccount, amount, reference: <invoice id>, returnUrl, countryCode, channel: "Web", allowedPaymentMethods: ["scheme"], authenticationData: { threeDSRequestData: { nativeThreeDS: "disabled" } }, metadata: { invoice_id } }` with an `idempotency-key` header. Answer `id`, `sessionData`, `expiresAt` (default one hour).
- Verify (`authorize` and `charge`, same code): `GET /sessions/{id}?sessionResult=<value from the browser>` -> `{ id, reference, status, payments[] { amount, paymentMethod { brand, type }, pspReference, resultCode }, additionalData }`. `status` `completed` means the payment was authorised. The adapter requires `completed`, `reference` equal to the invoice id, and one payment `Authorised` in USD for the invoice amount. `processorTransactionId` is that payment's `pspReference`. The session `status` is not updated afterwards ("do not make the request again to check for updates").
- Capture is automatic and immediate by default ("by default, payments are captured automatically without a delay"), so a sale is one step: `supportsAuthCapture: false`, `charge` present. A failed capture arrives as a `CAPTURE_FAILED` webhook (known limit).
- Refund: `POST /payments/{pspReference}/refunds` `{ merchantAccount, amount, reference }` with an `idempotency-key` header; answer `{ status: "received", pspReference, paymentPspReference }`. It is asynchronous: the result arrives as a `REFUND` (or `REFUND_FAILED`) webhook, so the adapter returns `pending`.
- **There is no call that reads a payment back by `pspReference`.** `getTransaction` therefore cannot be implemented; the payment flow above never needs it (it is used only to resume a payment that stayed `created` or `requires_action`). Request R3 stays open for that case.
- Connection test: `GET /sessions/CS_KD_CONNECTION_CHECK?sessionResult=x`; an answer that is not 401 or 403 (an error for the unknown session) means the key was accepted.

## 6. 3D Secure
Handled inside Drop-in (redirect flow requested). The session result does not expose a 3DS result in the pages read, so `supportsThreeDS: false` and every result is `{ requested: false, completed: false, authenticated: false, liabilityShift: null }`.

## 7. Card identity (REQ-CARD)
No fingerprint was found. From the session result `additionalData` (fields appear only when enabled under Developers, Additional data): `cardBin|cardSummary|expiryDate|brand`; otherwise null.

## 8. Decline mapping
Source: `refusalReasonCode` / `refusalReason` (webhook reason field and payment result). 12 (Not enough balance) -> insufficient_funds; 8 (Invalid Card Number) -> invalid_number; 6 (Expired Card) -> invalid_expiry; 24 (CVC Declined) -> invalid_cvv; 11, 38, 39, 42 (3D failures) -> three_ds_failed; 5, 14, 20, 22, 31 (blocked card, fraud) -> processor_fraud_signal; 2, 3, 10, 23, 25, 27, 28, 29, 46 -> do_not_honor; 4, 9, 21, 40 -> processor_error; everything else -> other. A session that ends `refused` or `canceled` has no refusal code in the session result, so it is `other`.

## 9. Webhooks (Standard webhook)
Body `{ live, notificationItems: [ { NotificationRequestItem: { pspReference, originalReference, merchantAccountCode, merchantReference, amount { value, currency }, eventCode, eventDate, success ("true"/"false"), reason, additionalData { hmacSignature } } } ] }`. **Signature**: for each item, data = `pspReference:originalReference:merchantAccountCode:merchantReference:amount.value:amount.currency:eventCode:success` (empty strings for missing values); `signature = base64(HMAC-SHA256(key = bytes of the hexadecimal HMAC key, data))`; compare with `additionalData.hmacSignature`. The adapter accepts a delivery only when every item verifies. Respond with a 2xx status within 10 seconds, before applying business logic; duplicates have the same `eventCode` and `pspReference`.
- Events used: `AUTHORISATION` with `success` true -> payment.captured (capture is immediate; the platform treats a webhook for a payment it already captured as nothing to do), `success` false -> payment.failed; `CAPTURE_FAILED` -> payment.failed; `CANCELLATION`, `EXPIRE` -> payment.voided; `REFUND` with `success` true -> payment.refunded (payment = `originalReference`); `CHARGEBACK`, `NOTIFICATION_OF_CHARGEBACK` -> dispute.opened; `CHARGEBACK_REVERSED` -> dispute.closed; everything else -> unknown.
- Event id: `eventCode:pspReference:success`. The payment is `pspReference` for `AUTHORISATION` and `originalReference` (the original payment's `pspReference`) for the others, falling back to `pspReference` when it is empty.

## 10. Idempotency
`idempotency-key` header on `/sessions` and the modification calls (the platform's key, hashed to 40 hexadecimal characters). Webhook duplicates are recognised by event code and `pspReference`.

## 11. Test data
Test cards (test platform only): Visa 4111 1111 4555 1142, Mastercard 5555 4444 3333 1111, Amex 3700 0000 0000 002; expiry 03/2030, security code 737 (7373 for Amex). The refusal reasons can be triggered in the test environment by the values on the "Testing result codes" page. Test API calls without the browser form use a `test_` prefix on encrypted card fields (not used).

## 12. Limits and capabilities
`supportsAuthCapture` false (immediate capture); `supportsThreeDS` false; `supportsRefund` true (asynchronous); `supportsPartialRefund` true; `supportsRecurring` false; `supportsPayout` false; not a merchant of record. Currency USD. Cards only (`allowedPaymentMethods: ["scheme"]`). No `getTransaction` (see section 5). Default live endpoint only. The HMAC data is not escaped (a `:` in a merchant reference would break verification; invoice references never contain one).

## 12a. Content security policy
Script and stylesheet: `https://checkoutshopper-test.cdn.adyen.com` and `https://checkoutshopper-live.cdn.adyen.com`. The hosts Drop-in calls and frames are not on the pages read; the sandbox run must record the violations the browser reports.

## 13. Open questions
1. The Content Security Policy hosts of Drop-in (section 12a).
2. Whether the browser's `result.sessionResult` is the property name in v6 (the guide says "get `sessionResult` from the `onPaymentCompleted` event").
3. Whether `payments[].amount` of a session is the authorised amount in minor units for USD (the specification says so).
4. How to resume an asynchronous payment without a lookup call (request R3).
5. The region-specific live endpoints and Drop-in `environment` values.
