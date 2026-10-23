# Verifone - verification record

Date: 2026-10-17. Two layers:

## A. Local checks (run, passing)
`npx tsx --conditions=react-server scripts/verify/step11-verifone.ts` -> 27 checks passed. A fake HTTP transport answers with the shapes of Verifone's OpenAPI specifications and documentation (docs/processors/verifone.md). Notification signatures are made in the script with generated EC P-256 and RSA keys. It proves:
- contract and credential field patterns; USD only; `supportsThreeDS: false`;
- checkout session: the exact `POST /v2/checkout` body (integer cents, `interaction_type: IFRAME`, `show_confirmation_page: false`, card `PAYMENT` with `capture_now: false`, invoice as `merchant_reference`, a reference starting with `=` is prefixed), Basic header built from the user id and key, only the checkout id and loader address in the client data; a loader address from another host or for another checkout, a refused request (error code shown, no key text) and missing ids are refused;
- region and environment: a sandbox account accepts `global` and `us`, a live account `emea`, `us` and `nz`; a wrong pair is refused before any call; the right host is used for each;
- authorize: the checkout is read back and checked against the invoice (entity, reference, USD, amount, transaction id); a different entity, reference, currency, amount, a text amount or another transaction id is refused; no outcome yet means "not completed"; unknown checkout and malformed token are refused; failed and declined attempts map to the platform categories; the newest outcome event wins; the auto-capture flag gives `captured`; a held amount that differs from the invoice is voided and refused; card identity from the token, else `first6|last4|brand` from the stored transaction, null when it cannot be read;
- errors: 401 and 403/113 throw a credential error without the key text; 5xx and 504 throw (retry); 403/111 maps to a fraud signal;
- capture: reads the stored transaction first, only the full authorized amount is captured, an already captured payment is returned without a call, a declined or unknown one is refused, an answer that does not say captured is checked again and otherwise reported as pending, a refusal is a decline;
- void: only an uncaptured authorization; an already voided payment is returned without a call; a captured one is refused;
- refund: settled payment -> `POST /refund` with integer cents, reason and the idempotency header (a deterministic UUID of version-5 layout), result under the refund id; capture still queued -> `void_capture` for the whole amount only (partial refused); not captured, too large, unknown, refused and pending cases;
- stored transaction states: 15 combinations of type and status, actions reported under the parent payment, unknown states map to `error`, never to success;
- decline mapping (12 codes), connection test (success, 401, 403, 504, 404);
- canonical JSON (RFC 8785: key order, escapes, large and fractional numbers, UTF-16 order of keys);
- notifications: detached JWS with unencoded payload verifies for ES256, RS256 and PS256 keys; the body is verified in canonical form (any key order or whitespace); a changed body, a missing or malformed header, a signature from another key, a signature over a non-canonical text, `none` and HMAC algorithms, extra critical parameters, a missing `crit`, a missing key id, a key of the wrong type, a wrong curve, an empty key file and an unreachable key file are all refused; the key file is fetched once and cached, and an unknown key id causes no more than one download; live uses the production key file; event mapping for the 11 listed events, the event id (differs per step, identical for a resend, `vf_` + 40 hex), metadata-only payloads, checkout events and unknown types.

## B. Sandbox scenarios (NOT run: no Verifone sandbox credentials in this environment; the notification key hosts are not reachable from here)
Nothing below is claimed as passed. With a Verifone Central sandbox account (user id, API key, organization id, a Payment Provider Contract of type Service Provider Simulator) and a sandbox notification (URL endpoint, full event payload) for the platform URL, run these and record the transaction ids here:

| Scenario | Test data | Expected | Result |
|---|---|---|---|
| credentials test success / failure | valid / wrong key / wrong region | ok / message without the key / region message | pending |
| checkout created | any USD invoice | `{ id, url }`, `url` is `<region host>/.../v2/loader.js?checkoutId=<id>`; confirm the exact path accepted by the form | pending |
| iFrame renders | load the payment page | Verifone frame appears in the container; record the hosts the frame loads (CSP, open question 2) | pending |
| completion message | pay in the frame | record the `postMessage` payload and origin of `CHECKOUT_COMPLETED` / `CHECKOUT_FAILED`; confirm the form calls the server | pending |
| success + capture | simulator, any amount | checkout events `TRANSACTION_SUCCESS`, status AUTHORIZED; `authorize` returns `authorized`; capture returns `captured` (`SETTLEMENT_REQUESTED`) | pending |
| capture answer shape | observe the capture response | status value after capture (open question 6) | pending |
| declines | amounts ending 121, 122, 123, 131; `merchant_reference` "please 121" | FAILED outcome; categories recorded; message safe | pending |
| partial result | amount ending 132 | AUTHORISED with reason PARTIAL; check how the adapter reports it | pending |
| security code results | 111, 222, 333 in the frame | no failure by itself; record `cvv_result` | pending |
| void | authorize then void | `voided` (`AUTHORIZATION_VOIDED`) | pending |
| void capture / refund before settlement | capture, then refund the full amount at once | `refunded` through `void_capture` | pending |
| refund after settlement | order of 76.51 (settles all captured), then refund 25.00 and the rest | `refunded`; refund id differs from the payment id | pending |
| stored transaction vocabulary | read a payment at each stage | `transaction_type` / `transaction_status` values match the mapping (open question 4) | pending |
| card identity | observe `masked_card_number`, `card_brand`, `card` | identity built; no token for plain card payments | pending |
| second attempt on a completed checkout | pay twice with one checkout | error 168; the invoice is paid once | pending |
| another invoice's checkout | send the checkout id of invoice A for invoice B | refused (`CHECKOUT_MISMATCH`) | pending |
| webhook valid | notification for an authorization | signature verifies with the key file; `payment.authorized`; core asks Verifone for the transaction | pending |
| webhook algorithm | observe the `alg` and `kid` of `x-vfi-jws` | one of the accepted algorithms (open question 5) | pending |
| webhook invalid | forged copy; copy with a changed amount | 401 + security event | pending |
| duplicate webhook | resend the same event | processed once (event id) | pending |
| refund / void events | refund in Verifone Central | `payment.refunded` under the original payment id | pending |
| CSP | load the payment page with the policy on | loader and frame are not blocked | pending |

## C. Known limits
- No 3D Secure: the platform's checkout input has no billing name and address, which Checkout needs for 3DS (docs section 6). The adapter declares `supportsThreeDS: false`.
- The browser message that ends the checkout is not fully documented; the server never trusts it, and a second button asks for the same server check.
- A capture is only for the full authorized amount; a refund of a capture that is still queued for the acquirer is full only.
- No AVS result and no expiry date in the card identity (billing address needs a Verifone customer record).
- The webhook needs the public key files of Verifone to be reachable from the server; if they are not, notifications are refused (fail closed) and payments are still confirmed by the status check.
- The Verifone sandbox needs a demo account arranged with Verifone; the simulator contract has no real acquirer.
