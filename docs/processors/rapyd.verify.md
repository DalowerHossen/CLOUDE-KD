# Rapyd - verification record

Date: 2026-10-18. Two layers:

## A. Local checks (run, passing)
`npx tsx --conditions=react-server scripts/verify/step12-rapyd.ts` -> 10 checks passed. A fake HTTP transport answers with the shapes of Rapyd's reference pages (docs/processors/rapyd.md). It proves:
- contract: one-step card sale (`charge` present, no capture or void), USD only, credential field patterns;
- amounts are printed as the shortest decimal (`120.5`, `120`, `0.07`) and read back from numbers without float arithmetic;
- checkout page: the exact `POST /v1/checkout` body (no whitespace), the `access_key`, `salt`, `timestamp` and `signature` headers with the signature recomputed independently from the documented formula (method in lower case, path, salt, timestamp, keys, body; hexadecimal text, then Base64), the idempotency header, sandbox and live hosts and toolkit script addresses; only the checkout id and the script address reach the browser; a refused request (code shown), a malformed id, a missing country, a non-https return address, 401, 5xx and missing keys are refused;
- `charge` and `authorize` read the payment (signature of a GET with an empty body): closed, paid, captured, USD, card, amount equal to the invoice, tagged by `merchant_reference_id` or metadata, card identity from the fingerprint token; active, error, unpaid, another currency, another amount, another invoice, a non-card method, an unknown payment and a malformed id are refused;
- refund: whole and partial bodies as bare numbers, `Pending` reported as pending, `Rejected` and an API error as declined, too large and already refunded amounts refused, a fully refunded payment answered from the stored state, a payment not paid refused before any refund call;
- states (canceled, reversed, expired, unknown), identity fallback `bin|last4|expiry|brand`, decline mapping for the three documented codes, lookup, connection test (accepted, 401 without the key text, 5xx);
- webhooks: the documented webhook formula (URL, salt, timestamp, keys, body); the URL-safe spelling, a changed body, salt or URL, an old timestamp, a malformed timestamp, missing headers, an empty body and a missing URL are refused; event mapping for capture, failure, cancel, expiry, reversal, refund (payment id from `data.payment`), disputes (`original_transaction_id`, millisecond time), event id fallback to `token`, and the unrelated `PAYMENT_SUCCEEDED`.

## B. Sandbox scenarios (NOT run: no Rapyd credentials in this environment)
Nothing below is claimed as passed. With Rapyd sandbox keys and a webhook URL run these and record the ids here:

| Scenario | Test data | Expected | Result |
|---|---|---|---|
| credentials test success / failure | valid / wrong secret key | ok / message without the key | pending |
| signature accepted | any signed call | no 401; confirms hexadecimal-text Base64 form | pending |
| checkout page created | USD invoice 1.50 | `checkout_...`; whole amount sent as integer accepted | pending |
| toolkit renders and pays | card 4111111111111111 | `onCheckoutPaymentSuccess` with `payment_...` | pending |
| payment verified | that payment | `charge` returns `captured`; reference and metadata present | pending |
| 3DS | 3DS test flow of the sandbox | redirect and return; payment closed | pending |
| declines | 4111111111111105, ...143, ...151 | categories do_not_honor, processor_fraud_signal, insufficient_funds | pending |
| simulated errors | amounts 2000 to 2009, 4000 to 4009 | failure codes recorded | pending |
| refund whole / part | closed payment | `Completed`; `REFUND_COMPLETED` webhook | pending |
| webhook valid / invalid | `PAYMENT_CAPTURED`; a forged copy | processed / 401 + security event | pending |
| duplicate webhook | resend | processed once (event id) | pending |
| dispute | cardholder dispute simulation | `dispute.opened` with the payment id | pending |

## C. Known limits
- One-step sale only (`capture: true`); there is no authorize-then-capture path.
- Cards only (one category per toolkit page); other Rapyd methods are not used.
- The webhook URL must be typed exactly as in the Client Portal (it is part of the signature).
- The webhook timestamp window (five minutes) is a platform choice; Rapyd states none.
- Decline mapping covers only three documented card codes; the rest are `other`.
- The success event could in theory fire for a payment still in 3DS; the server read-back refuses an unpaid payment.
