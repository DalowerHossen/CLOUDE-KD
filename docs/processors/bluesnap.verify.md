# BlueSnap - verification record

Date: 2026-10-17. Two layers:

## A. Local checks (run, passing)
`npx tsx --conditions=react-server scripts/verify/step11-bluesnap.ts` -> 14 checks passed. A fake HTTP transport answers with the shapes of BlueSnap's Developer Hub pages (docs/processors/bluesnap.md). It proves:
- checkout session: the payment fields token is read from the end of the `Location` header of the `201` answer (a missing header or a token with other characters is refused); Basic authentication, `bluesnap-version: 3.0`, sandbox and production hosts and script addresses; the token and the display amount are the only things given to the browser, no password;
- authorize: the exact `AUTH_ONLY` request (amount as a JSON number, `USD`, `pfToken`, **`storeCard: false`**, `transactionInitiator: SHOPPER`, `merchantTransactionId` of letters, digits and hyphens within 50 characters, `cardHolderInfo` with zip and country only when known, no card object), the idempotency header (40 hexadecimal characters derived from the core's key); result mapping (status, transaction id, AVS postal match, identity `bin|last4|brand`, no identity without a BIN, 3D Secure result, `processingStatus` in either letter case, `PENDING_MERCHANT_REVIEW` as pending, other statuses as error);
- declines: 18 error names mapped to the platform categories (including the sandbox spelling `INSUFFICENT_FUNDS` and the three soft declines for 3D Secure); HTTP 400 and 422 are failed payments with the amount kept; 401 and a 403 without a message list throw a validation error naming credentials, permissions and the server address; a 403 with a message list is a failed payment; 409, 429, 500 and 503 throw (the same key is safe to retry); token shape checks before any call;
- 3D Secure: the five `authenticationResult` values and the missing case;
- capture (exact request, a partial amount, `TRANSACTION_ALREADY_CAPTURED` as a failed capture), void (`AUTH_REVERSAL`; an already reversed authorization is read as success; an expired one is refused), refund (exact body and key; `SUCCESS` refunded, `PENDING` pending, `FAILED` declined as processor error, error 14004 "not cleared yet" as a failed refund), status lookup for seven states, unknown transaction, id shape checks;
- connection test with a token request (`201` ok; 403 names the Authorized IPs list; 401 never repeats the password; outage);
- webhooks: **always refused and mapped to `unknown`** (blocker B1), with no call to BlueSnap.

## B. Sandbox scenarios (NOT run: no BlueSnap sandbox credentials in this environment)
Nothing below is claimed as passed. With a BlueSnap sandbox account (API user key and password, this platform's server addresses on the Authorized IPs list, 3D Secure enabled in the Merchant Portal), run these and record the transaction ids here:

| Scenario | Test data | Expected | Result |
|---|---|---|---|
| credentials test success / failure / unlisted address | valid / wrong password / address not authorized | ok / message without the password / Authorized IPs message | pending |
| token request | observe the answer | `201` with the token at the end of `Location` | pending |
| success + capture | Mastercard 5425233430109903 (04/2029) | authorized (`AUTH_ONLY`), then captured (`CAPTURE`) | pending |
| no vaulting | observe the transaction | `storeCard` false, no vaulted shopper | pending |
| partial capture | capture less than the authorization | accepted; `openToCapture` shows the rest | pending |
| declines by security code | Visa 4000000000001000 / 11/2029 with 908, 909, 910, 914, 916, 923, 932, 935, 936 | `invalid_cvv`, `do_not_honor`, `invalid_expiry`, `insufficient_funds`, `invalid_number`, `processor_fraud_signal`, `three_ds_failed` (x3); record the HTTP status | pending |
| declines by amount | Visa 4000000000007007 with 709, 714, 732 | `do_not_honor`, `insufficient_funds`, `three_ds_failed` | pending |
| AVS postal | Visa 4012000033330026 (03/2029, CVV 837, amount 97.52) | postal match false; with 10.60 (11/2029, CVV 371) true | pending |
| response fields | observe | `binNumber` present (else no identity), real `processingStatus` letter case | pending |
| 3D Secure | `'3DS': true` with the cards above | challenge or frictionless; `threeDSecure.authenticationResult` present in the Auth Only answer and in Retrieve; confirms the payment page policy (request R2) allows the challenge | pending |
| void | authorize then void from the review page | `voided` (`AUTH_REVERSAL`) | pending |
| refund | partial 25.00 then the rest, right after a capture and after clearing | `SUCCESS` or `PENDING`; record error 14004 if refused before clearing | pending |
| idempotency | send the same authorize twice | the same transaction both times | pending |
| fraud review | an account with a rule that holds | `pending`, `PENDING_MERCHANT_REVIEW` | pending |
| IPN authentication (blocker B1) | enable IPNs in the sandbox, read the `bls-signature` and `bls-ipn-timestamp` headers | needed to write the verification | blocked |
| CSP | load the payment page with the policy on | the card frames load; the 3D Secure challenge is not blocked | pending |

## C. Known limits
- **Webhooks are not accepted** until blocker B1 is resolved (`docs/steps/STEP-11/BLOCKERS.md`): later changes (a pending refund completing, chargebacks) are not seen automatically.
- BlueSnap calls are accepted only from the addresses on the account's Authorized IPs list (or with IP checking disabled, which BlueSnap advises against); the deployment needs fixed outbound addresses.
- 3D Secure needs a permissive content security policy for the issuer's challenge (request R2).
- A refund of a payment that has not cleared (3 to 7 days) can be refused by BlueSnap.
- The card identity has no expiry and is skipped when the BIN is not returned.
