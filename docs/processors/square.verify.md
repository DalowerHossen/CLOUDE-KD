# Square - verification record

Date: 2026-10-17. Two layers:

## A. Local checks (run, passing)
`npx tsx --conditions=react-server scripts/verify/step11-square.ts` -> 14 checks passed. A fake HTTP transport answers with the shapes of Square's OpenAPI specification and documentation (docs/processors/square.md). It proves:
- checkout session: only public data (application id, location id, SDK address for the environment, display amount); missing ids refused; no token in the client data;
- request key: a fixed 40-character digest of the core's key (deterministic, inside the 45-character limit);
- authorize: the exact `POST /v2/payments` body (`source_id`, digest key, amount in cents as an integer with `USD`, `autocomplete: false`, `delay_duration` `PT144H`, `delay_action` `CANCEL`, location, invoice as `reference_id`, `customer_initiated: true`), bearer token and `Square-Version` headers, sandbox host; result mapping (status, payment id, AVS true / false / unknown, identity from the fingerprint, else `bin|last4|expiry|brand`, 3DS fields all false); only `cnon:` tokens are accepted (card-on-file, bank and other prefixes refused before any call);
- declines: 10 error codes mapped to the platform categories, a `FAILED` payment with `card_details.errors`; authentication errors, expired token, HTTP 5xx and 429, `API_ERROR` and `RATE_LIMIT_ERROR` throw instead of becoming a payment failure; missing token refused;
- capture: reads the payment first, only the full authorized amount is captured (a different amount is refused), a payment that is already completed is reported as captured, a cancelled or unknown one is refused, id shape checked;
- void and the repeat case (`DELAYED_TRANSACTION_CANCELED` read as success after checking the payment); a void after capture is refused;
- refund: exact body (payment id, cents, digest key under 45 characters, reason), `PENDING` -> pending, `COMPLETED` -> refunded, `REJECTED` -> declined as `processor_error`, `REFUND_AMOUNT_INVALID` -> declined; status lookup for eight states including partial and full refund through `refunded_money`;
- connection test: active USD location with card processing; wrong currency, no card capability, inactive, unknown location, bad token (no token text in the message), outage;
- webhooks: Base64 HMAC-SHA-256 over notification URL + raw body; refusal of a wrong key, a wrong URL, a changed body, a missing header, an empty body and missing credentials **without** any call to Square; mapping of payment statuses, refund completion, dispute created / state updated (won, lost, accepted close it) / evidence events, payment id taken from the payment, the refund and the disputed payment, unknown types.

## B. Sandbox scenarios (NOT run: no Square sandbox credentials in this environment)
Nothing below is claimed as passed. With a Developer Console application in Sandbox mode (application id, USD location id, access token), a sandbox webhook subscription for the platform URL (signature key, URL), run these and record the payment ids here:

| Scenario | Test data | Expected | Result |
|---|---|---|---|
| credentials test success / failure | valid / wrong token / wrong location id | ok / message without the token / location message | pending |
| `Square-Version` accepted | any call | `2026-09-16` accepted | pending |
| success + capture | browser form, card 4111 1111 1111 1111 | authorized (`APPROVED`), then captured (`COMPLETED`) | pending |
| delay settings | observe `delay_duration`, `delay_action`, `delayed_until` | `PT144H`, `CANCEL` accepted | pending |
| identity | observe `card_details.card.fingerprint` | present (`sq-1-...`) | pending |
| declines | CVV 911; postal code 99999; expiry 01/40; card 4000 0000 0000 0002; token `cnon:card-nonce-already-used` | `invalid_cvv`, `other` (address), `invalid_expiry`, `do_not_honor`, `other`; check the HTTP status (400 or 402) | pending |
| 3DS | cards 4800 0000 0000 0004 (no challenge), 4310 0000 0020 1019 (modal, code 123456), 4811 1100 0000 0008 (failed verification) | token returned or tokenize fails; payment outcome recorded; confirms the Payment object shows no 3DS field | pending |
| postal review | wrong postal code vs the checkout page | `pending_review`, no capture | pending |
| void | authorize then void from the review page | `voided` (`CANCELED`) | pending |
| refund right after capture | partial 25.00, then the rest | accepted; status `PENDING` then `COMPLETED`; payment stays `COMPLETED` with `refunded_money` | pending |
| capture of a different amount | request less than authorized | refused by the adapter before any call | pending |
| webhook valid / invalid | `payment.updated`, `refund.updated` from the sandbox; a forged copy | processed / 401 + security event | pending |
| duplicate webhook | resend the same event | processed once (`event_id`) | pending |
| dispute events | sandbox dispute test (Disputes API test page) | `dispute.created` / `dispute.state.updated` processed with the payment id; check `data.object.object.disputed_payment` | pending |
| CSP | load the payment page with the policy on | the card frame, fonts and the Square connect hosts are not blocked | pending |

## C. Known limits
- Square reports no 3D Secure result on the Payment object, so the adapter declares `supportsThreeDS: false`; authentication still runs inside the card form when Square or the seller's Risk Manager asks for it.
- A capture is always for the full authorized amount (CompletePayment has no amount).
- A refund usually starts as `PENDING` and completes later (the `refund.updated` webhook or a status check).
- A Square account takes payments only in its own country's currency; the location must be a USD (United States) location.
