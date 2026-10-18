# FastSpring - verification record

Date: 2026-10-18. Two layers:

## A. Local checks (run, passing)
`npx tsx --conditions=react-server scripts/verify/step12-fastspring.ts` -> 11 checks passed. A fake HTTP transport answers with the shapes of FastSpring's reference pages (docs/processors/fastspring.md). It proves:
- contract: merchant of record, one-step sale (`charge` present, no capture or void), USD only, credential field patterns;
- amounts are printed as bare JSON numbers from cents (`120.50`, `0.07`) and read back from numbers without float arithmetic;
- checkout session: the exact `POST /v2/checkouts/{store}/{checkout}/sessions` body (`live` from the environment, invoice in `orderTags`, product path with `customPrice.unitPrice.USD`), Basic header; only the session id, the checkout URL and the script address reach the browser; a 400, a session that is not ready, a missing id, missing checkout path, URL or product path, 401 and 5xx are refused;
- `charge` and `authorize` read the order back: completed, test or live matching the environment, USD, amount equal to the invoice (subtotal or total; tax on top is accepted and not booked), card identity `brand|last4`; an array answer is accepted; not completed, a live order in the sandbox, another currency, another amount, an unknown order, a malformed id and a test order on a live account are refused;
- refund: a whole refund (`FULL`), a partial refund (`PARTIAL` with the product path and amount as a number), `completed: false` reported as pending, an error entry as declined, too large and not completed refused before any call;
- lookup (malformed id refused), non-card payment identity, decline mapping, connection test (accepted, 401 without the password text, 5xx);
- webhooks: base64 HMAC-SHA256 of the raw body; a wrong secret, a changed body, missing, empty header, empty body and empty secret are refused; event mapping for completed and failed orders, returns, chargebacks, a delivery with an unrelated first event, and unrelated events.

## B. Sandbox scenarios (NOT run: no FastSpring credentials in this environment)
Nothing below is claimed as passed. With a FastSpring store (API credentials, a Component Checkout enabled by Support, a catalog product, a webhook secret) run these and record the ids here:

| Scenario | Test data | Expected | Result |
|---|---|---|---|
| credentials test success / failure | valid / wrong password | ok / message without the password | pending |
| session created | USD invoice 1.50 | `201`, `READY_FOR_CHECKOUT`, session price equals the invoice (no catalog price) | pending |
| component checkout rendered | form on an allowed origin | card, pay button and disclosures render | pending |
| sale verified | test card 4242 4242 4242 4242 | order completed, `live: false`, `charge` returns `captured`, amount equals the invoice | pending |
| tax on top | buyer in the US with a Net store | `subtotal` equals the invoice, `total` larger; booked amount is the invoice | pending |
| declined payment | 4000 0000 0000 0002 | `onPaymentFailed`, `order.failed` | pending |
| refund whole / part | completed test order | return `completed`; check `return.created` | pending |
| webhook valid / invalid | `order.completed`; a forged copy | processed / 401 + security event | pending |
| duplicate webhook | resend the same event | processed once (event id) | pending |
| chargeback event | simulated if offered | `dispute.opened` with the order id | pending |

## C. Known limits
- Checkout Components are Beta and must be enabled by FastSpring; the checkout shows "unavailable" until the session loads.
- Order tags are not visible in the order payloads read, so the order is bound to the invoice by amount, currency and the unique processor transaction.
- Tax added on top is FastSpring's; the platform books the invoice amount.
- A multi-event webhook delivery maps only the first known event.
- No idempotency header exists; no decline codes (every failure is `other`).
- Card identity has no BIN, expiry or fingerprint.
- FastSpring is the seller of record: its terms, tax handling and payout timing differ from the other processors; refunds of orders older than six months or under dispute go through FastSpring Support.
