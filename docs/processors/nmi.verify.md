# NMI - verification record (both modes)

Date: 2026-10-18. Two layers:

## A. Local checks (run, passing)
`npx tsx --conditions=react-server scripts/verify/step12-nmi.ts` -> 15 checks passed. A fake HTTP transport answers with the shapes of NMI's REST API v5 definitions and documentation (docs/processors/nmi.md). It proves:
- contract: two modes (`collectjs` default, `payment_component`), credential field patterns, USD only, `supportsThreeDS: false`;
- amounts are sent as bare numbers printed from cents (`120.50`, `0.07`, `1000.00`), never through floating point;
- checkout session for each mode: only the tokenization key, the mode and the sandbox script address; no private key in the client data; a live account, an unknown mode and a missing key are refused;
- connection test for each mode (the test action the STEP 10 mode switch uses): tokenization key present, then the private key checked with a payment id that cannot exist (404 or 400 = accepted, 401 = refused without the key in the message, 5xx and unexpected answers fail); an unknown mode, a short key and a live account fail before any call;
- authorize through the shared server module: the exact body (token, billing zip and country and the payer address only when valid, invoice as order id, amount as a number), private key in `Authorization`, no idempotency header; result mapping (id, state from the actions, identity from the card hash, AVS, 3DS fields all false); malformed tokens refused before any call; eight response codes map to the platform categories; `response` 3 is an error; an HTTP 400 body is a decline; 401 throws a credential error; 5xx and 429 throw; a held amount that differs from the invoice is voided and refused;
- capture: reads the payment first, only the full authorized amount is captured, an already captured payment is returned without a call, voided or unknown ones are refused, a declined capture is a decline;
- void: only an uncaptured authorization; an already voided payment is returned without a call;
- refund: settled payment -> `POST /refund` with the amount, result under the refund id; an unsettled payment (`pendingsettlement`) -> a full refund is a void reported as `refunded`, a partial refund is refused; not captured, too large, unknown, declined;
- payment states read from the actions (authorized, captured, voided, partial and full refund, failed actions ignored, unreadable = `pending`), card identity (hash, else `bin|last4|exp|type`), AVS (match, mismatch, unknown), decline mapping;
- webhooks: `Webhook-Signature: t=<nonce>,s=<hex>` over `nonce.body` with the signing key; uppercase hex accepted; a wrong key, a changed body, a changed nonce, a missing, empty, malformed or non-hex header, an empty body and a missing key are refused without any call; mapping of the nine used events, everything else `unknown`, transaction id from `event_body`.

## B. Sandbox scenarios (NOT run: no NMI sandbox credentials in this environment, and `sandbox.nmi.com` is not reachable from it)
Nothing below is claimed as passed. With an NMI sandbox merchant (private security key, tokenization key, webhook signing key from guide.nmi.com) run these for **both modes** and record the payment ids here:

| Scenario | Test data | Expected | Result |
|---|---|---|---|
| credentials test, mode collectjs / payment_component | valid / wrong private key | ok / message without the key | pending |
| mode switch | switch to the other mode from the super admin page | refused until that mode's test passed, accepted afterwards, one mode active, audit entry | pending (STEP 10 page) |
| Collect.js token | Visa 4111111111111111, 10/29, 999 | token returned by `callback` | blocked (B1: no form) |
| Payment Component token | same card | token from `onPay` | blocked (package request R1) |
| authorize + capture, each mode | the token, amount 1.50 | `authorized` then `captured`; both modes use `shared-server.ts` | pending |
| record the answer shape | observe `status`, `actions[].type`, `payment_details.card_hash` | confirms section 5 and 7 of the record | pending |
| token reuse | send the same token twice | second call refused; record the error body | pending |
| token expiry | a token older than 24 hours | refused; record the error body | pending |
| declines | amount 0.50 | `response` 2; record `response_code` and the HTTP status | pending |
| fatal error | invalid card number | `response` 3 or HTTP error; record | pending |
| AVS and security code | address 888 with ZIP 77777; code 999 | match values; record `avs_response`, `cvv_response` | pending |
| void | authorize, then void | `voided` | pending |
| refund before settlement | capture, then refund the full amount | void path -> `refunded`; record `status` value before settlement | pending |
| refund after settlement | settled sandbox payment, partial then rest | `refunded`; record the refund id and the answer | pending |
| duplicate submission | the same request twice within 2 seconds | record the duplicate-check answer (response code 430) | pending |
| webhook valid / invalid | `transaction.sale.success`; a forged copy | processed / 401 + security event | pending |
| duplicate webhook | resend the same event | processed once (`event_id`) | pending |
| 3DS cards | 4100000000000100 and 4100000000005000 | payment succeeds without 3DS data (adapter requests none); record | pending |
| CSP | load the payment page with the policy on | scripts and frames of the mode are not blocked | blocked (no form) |

## C. Known limits
- Neither browser form exists yet: Collect.js (blocker B1, the submission trigger is undocumented) and the Payment Component (npm package request R1). The checkout shows "unavailable" for NMI until one is written.
- Live accounts are refused: the production REST API address is not documented (B2).
- No 3D Secure (billing contact missing from the checkout input, STEP 11 request R4).
- No idempotency header exists in the REST API: a retried authorization after a timeout is protected only by the processor's own duplicate check.
- A capture is for the full authorized amount only; a full refund of an unsettled payment is a void.
- The `actions[]` type strings, the `status` values and the refund answer were not shown with examples; the adapter reads them by keyword and treats an unreadable payment as `pending`.
