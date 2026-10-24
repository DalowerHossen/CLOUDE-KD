# Braintree - verification record

Date: 2026-10-17. Two layers:

## A. Local checks (run, passing)
`npx tsx --conditions=react-server scripts/verify/step11-braintree.ts` -> 18 checks passed. A fake HTTP transport answers with the shapes of Braintree's GraphQL reference and guides (docs/processors/braintree.md). It proves:
- checkout session: `createClientToken` with the merchant account id when one is set (and without it otherwise), HTTP Basic public:private, the `Braintree-Version` and JSON headers, sandbox and live hosts, amount and 3DS policy handed to the browser, no private key in the client data;
- authorize: the exact `authorizePaymentMethod` input (`apiRequestKey` = the core's key, nonce as `paymentMethodId`, two-decimal USD amount, invoice as `orderId`, merchant account, customer IP only when it looks like an address); result mapping for status, transaction id, AVS postal match / mismatch / unknown, identity (`uid:` from the unique number identifier, else `bin|last4|expiry|brand`), 3DS result;
- declines: 11 processor response codes and 8 gateway rejection reasons mapped to the platform categories, `FAILED` as an error; a request the service refuses (VALIDATION) is a payment failure with the legacy code, while INTERNAL / SERVICE_AVAILABILITY / HTTP 5xx throw (the same `apiRequestKey` is then safe to retry), and bad keys (AUTHENTICATION or HTTP 401) throw a validation error; nonce and transaction id shapes are checked before any call;
- 3D Secure reading from the server-side snapshot: successful, attempt, failed, not enrolled, challenge required, none;
- capture (amount sent, a refused repeat that already worked is reported as captured), void (same), refund of a settling payment, refund of a payment still `SUBMITTED_FOR_SETTLEMENT` (full amount becomes a void, a partial amount is refused with a clear reason), refused refund, unknown transaction, wrong status; status lookup for eight statuses;
- connection test: `ping`, then a client token; failure messages never contain the private key;
- webhooks: the HMAC-SHA1 signature of Braintree's own SDK (key = SHA1 of the private key; payload as received or with the other trailing newline; key pair picked from a list), refusal of a wrong private key, wrong public key, tampered or illegal payload, missing fields and missing credentials **without** any call to Braintree; mapping of eight dispute kinds and two transaction kinds, transaction id converted to the GraphQL id, stable event id, unknown kind; the destination-check challenge answer.

## B. Sandbox scenarios (NOT run: no Braintree sandbox keys in this environment)
Nothing below is claimed as passed. With a sandbox account (public key, private key, optional USD merchant account id), a Control Panel webhook for the platform URL, 3D Secure enabled on the sandbox merchant account, run these and record the transaction ids here:

| Scenario | Test data | Expected | Result |
|---|---|---|---|
| credentials test success / failure | valid keys / wrong private key / wrong merchant account id | ok / message without the key / merchant account message | pending |
| `Braintree-Version` accepted | any call | the date `2026-10-17` is accepted (otherwise change the constant in `braintree/api.ts`) | pending |
| success + capture | nonce `fake-valid-nonce`, amount 120.50 | authorized, then captured (`SUBMITTED_FOR_SETTLEMENT`) | pending |
| id padding | observe the returned transaction id | no `=` padding (the webhook id conversion relies on it) | pending |
| declines by amount | 2001.00, 2004.00, 2005.00, 2010.00, 2046.00, 2099.00, 3000.00 | `insufficient_funds`, `invalid_expiry`, `invalid_number`, `invalid_cvv`, `do_not_honor`, `three_ds_failed`, `processor_error` | pending |
| gateway rejection | amount 5001.00; nonce `fake-gateway-rejected-risk-thresholds-nonce` | `processor_error` (application incomplete); `processor_fraud_signal` | pending |
| AVS postal | observe `avsPostalCodeResponse` for a hosted-fields nonce with and without a postal code | match / unknown; check the exact field is present in `statusHistory` | pending |
| unique number identifier | observe whether `uniqueNumberIdentifier` is returned for a one-time card | identity `uid:...` or the fallback | pending |
| 3DS pass | nonce `fake-three-d-secure-visa-full-authentication-nonce`; also the frictionless and step-up v2 nonces | captured, `threeDS.authenticated` true | pending |
| 3DS fail / attempt / not enrolled | `...failed-authentication-nonce`, `...attempts-non-participating-nonce`, `...not-enrolled-nonce` | `three_ds_failed` by the core's rule; attempt: liability shift without authentication; not enrolled: completed, not authenticated | pending |
| void | authorize, then void from the review page | `voided` | pending |
| refund before settlement | capture then refund the full amount at once | done as a void, `refunded` | pending |
| partial / full refund after settlement | `sandboxSettleTransaction`, then refund 25.00 and the rest | `partially_refunded`, `refunded` | pending |
| authorization expiry | wait or inspect `AUTHORIZATION_EXPIRED` handling | `voided` | pending |
| duplicate request key | send the same authorize twice | the same transaction in its current status | pending |
| webhook valid / invalid | Control Panel "Check URL" (kind `check`), then a dispute: card `4023898493988028` | `check`: processed as unknown; dispute: processed with the transaction id; a request with a wrong signature is refused 401 + security event | pending |
| webhook destination check | create the webhook URL in the Control Panel | needs the `GET` challenge answer (see `docs/steps/STEP-11/DEPENDENCY_REQUESTS.md` R1) | pending |
| dispute XML names | read the stored dispute payload | `subject/dispute/transaction/id` present | pending |
| CSP | load the payment page with the policy on | Hosted Fields frames and the 3D Secure challenge are not blocked; add the Cardinal origins to `PROCESSOR_ORIGINS.braintree` if they are | pending |

## C. Known limits
- A repeated authorize with the same key while the first is still running is a VALIDATION error at Braintree; the adapter reports it as a failed payment (the core retries only on a new user action).
- No webhook exists for card authorization, capture, void or refund results; later states (settlement, expiry) are read with `getTransaction`.
- Device data for the Advanced Fraud Tools is not collected (outside this adapter).
