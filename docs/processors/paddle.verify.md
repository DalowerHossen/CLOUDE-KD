# Paddle - verification record

Date: 2026-10-18. Two layers:

## A. Local checks (run, passing)
`npx tsx --conditions=react-server scripts/verify/step12-paddle.ts` -> 10 checks passed. A fake HTTP transport answers with the shapes of Paddle's OpenAPI description (docs/processors/paddle.md). It proves:
- contract: merchant of record, one-step sale (`charge` present, no capture or void), USD only, credential field patterns;
- checkout session: the exact `POST /transactions` body (non-catalog price with product, tax included in the price, cents as text, invoice in `custom_data`), bearer header, sandbox and live hosts; only the transaction id, the client token and the environment reach the browser; a refused request (code shown), a malformed answer, a missing client token, 403 and 5xx are refused;
- `charge` and `authorize` read the transaction back: `completed` and `paid` are a sale with card identity from the attempt (`last4|expiry|type`); not completed, a failed attempt (category from `error_code`), canceled, another invoice, another amount, another currency, an unknown transaction and a malformed id are all refused;
- refund: a whole refund (`type: full`), a partial refund (`type: partial` with the line item and cents), `pending_approval` reported as pending, `rejected` as declined, an API refusal mapped, and refusals before any adjustment (too large, not completed, no item to refund, unknown);
- transaction states, adjustments, lookup (an `adj_` id is refused), decline mapping, connection test (success, 403 without the key text, 5xx, 400);
- webhooks: `ts:body` HMAC with the five-second limit (accepted at 5 seconds, refused at 6, future timestamps accepted), a wrong secret, a changed body, a changed timestamp, missing, empty and malformed headers, an empty body and a missing secret are refused; event mapping for transactions, refund adjustments, chargebacks and unrelated events.

## B. Sandbox scenarios (NOT run: no Paddle sandbox credentials in this environment)
Nothing below is claimed as passed. With a Paddle sandbox account (API key, client-side token, notification secret) run these and record the ids here:

| Scenario | Test data | Expected | Result |
|---|---|---|---|
| credentials test success / failure | valid / production key on the sandbox | ok / message without the key | pending |
| transaction created | USD invoice 1.50 | `txn_...`, `draft` or `ready`, no tax added to the total | pending |
| tax category | `standard` not enabled on the account | clear refusal; record the error code | pending |
| checkout opened | Paddle.js with the transaction id | blocked (B5: no form) | blocked |
| sale verified | complete the checkout in the sandbox | `completed`; `charge` returns `captured`; amount equals the invoice | pending |
| amount with tax | account with tax collection | `grand_total` equals the invoice amount with `tax_mode: internal` | pending |
| declined payment | sandbox decline card | `error_code` and category recorded | pending |
| refund whole / part | completed transaction | adjustment `pending_approval`, then `approved` within ten minutes in the sandbox | pending |
| webhook valid / invalid | `transaction.completed`; a forged copy; a copy older than 5 seconds | processed / 401 + security event | pending |
| duplicate webhook | resend the same event | processed once (`event_id`) | pending |
| chargeback simulation | Paddle notification simulator | `dispute.opened` with the transaction id | pending |

## C. Known limits
- No browser form (B5); the checkout shows "unavailable" for Paddle.
- The webhook window is five seconds, the limit of the official library; a slow server clock refuses valid events (Paddle retries).
- No idempotency header exists in the API.
- Card identity has no BIN and no fingerprint.
- Paddle can hold a refund for review; it is `pending` until the `adjustment.updated` event.
- Paddle is the seller of record: its terms, tax handling and payout timing differ from the other processors.
