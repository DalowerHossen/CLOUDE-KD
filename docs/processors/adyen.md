# Adyen - documentation record (INCOMPLETE: documentation host unreachable, see STEP 12 blockers B3 and B4)

## 1. Sources read
Read in this session on 2026-10-18 (UTC). **`docs.adyen.com`, `www.adyen.com` and the Adyen API hosts are refused by the network policy of this environment**, so none of Adyen's guide pages could be read (sandbox access, test cards, Drop-in and sessions guides, result codes, refusal reasons, webhook guide, HMAC guide, live endpoint prefix). What was read, all published by Adyen:
- Adyen's OpenAPI repository `Adyen/adyen-openapi` (raw files): Checkout API v71 (`json/CheckoutService-v71.json`, version 71), the Payments API v68 (`PaymentService-v68.json`, older, not used), and the generic webhook specification file.
- Adyen's official Node API library (`Adyen/adyen-node-api-library`): `src/utils/hmacValidator.ts` and the notification typings (`notificationRequestItem.ts`), for the webhook signature.
- Adyen Web (Drop-in and Components) README and package metadata from the npm registry.

## 2. Authentication and credential fields
Checkout API: header `X-API-Key: <API key>` (security scheme `ApiKeyAuth`; Basic auth is also defined). Request bodies carry `merchantAccount`. Browser: the Adyen Web README names a **client key** (public) next to the API key. Credential fields would be: `apiKey` (secret), `clientKey` (public), `merchantAccount`, `hmacKey` (secret; hexadecimal), `environment` handled by the platform. Amounts are `Amount { value (integer minor units), currency }`.

## 3. Environments
Checkout API test server in the specification: `https://checkout-test.adyen.com/v71`. **The live server is account specific (a per-merchant prefix) and is documented only on the blocked guide pages** (B3). A test account is created at the Adyen sign-up page (README).

## 4. Secure form
Sessions flow: `POST /sessions` (required: `amount`, `merchantAccount`, `reference`, `returnUrl`; optional `captureDelayHours`, `shopperIP`, `shopperEmail`, `countryCode`, `authenticationData`, `metadata`, `expiresAt` (default 1 hour), ...) returns `id`, `sessionData` and the request echoed. The browser (Adyen Web Drop-in or Components, npm package `@adyen/adyen-web`, active major version 6) is given the session and **completes the payment itself**; the merchant server does not submit a payment. The package needs the Integrator (request R2). The documents give the lifecycle table (5.x inactive, 6.x active); the newest 6.x published at least two weeks before 2026-10-18 is 6.45.1 (2026-09-17).

## 5. Operations
- Outcome of a session: `GET /sessions/{sessionId}?sessionResult=<value given by Drop-in>` -> `{ id, reference, status (active, canceled, completed, expired, paymentPending, refused), payments[] { pspReference, resultCode (Authorised, Received, Pending), amount, paymentMethod } }`. The specification says the status "doesn't get updated" and must not be polled; the payment outcome is also sent "asynchronously, in an AUTHORISATION webhook".
- Capture `POST /payments/{paymentPspReference}/captures`, cancel `.../cancels`, refund `.../refunds`, reversal `.../reversals`, amount update `.../amountUpdates`: request `amount`, `merchantAccount`, `reference`; they are **asynchronous** (the answer is "received" with a new `pspReference`; the result arrives as a CAPTURE, CANCELLATION or REFUND webhook).
- **There is no endpoint in the Checkout API to read a payment back by `pspReference`.**

## 6. 3D Secure
`authenticationData` in the session request configures 3DS; the result arrives in the payment (`threeDS2Result`) which the browser flow handles. Not recorded further (guide pages unreadable).

## 7. Card identity
Not recorded: the additional data of the authorisation webhook (`cardSummary`, `cardBin`, ... in `additionalData`) is optional and must be enabled in the Customer Area; a fingerprint field was not confirmed.

## 8. Decline mapping
Not recorded: the refusal reason table is on the blocked guide pages.

## 9. Webhooks (from the official Node library)
Body `{ live, notificationItems: [ { NotificationRequestItem: { pspReference, originalReference, merchantAccountCode, merchantReference, amount { value, currency }, eventCode, eventDate, success ("true" or "false"), reason, operations[], paymentMethod, additionalData { hmacSignature, ... } } } ] }`. **Signature** for payment webhooks: `hmacSignature` in `additionalData`; data to sign = `pspReference:originalReference:merchantAccountCode:merchantReference:amount.value:amount.currency:eventCode:success` (missing values empty); `signature = base64(HMAC-SHA256(key = bytes of the hexadecimal HMAC key, data))`; compare in constant time. The acknowledgement text and retry policy are on the blocked pages.

## 10. Idempotency
Not recorded (guide pages unreadable).

## 11. Test data
Not recorded (test card page unreadable).

## 12. Limits and capabilities
Cannot be fixed until the blockers below are resolved. Findings that matter for the design: the sessions flow completes the payment in the browser, modifications are asynchronous, and the Checkout API has no retrieve call.

## 13. Open questions
See `docs/steps/STEP-12/BLOCKERS.md` B3 and B4. No adapter, route or form has been written for Adyen.
