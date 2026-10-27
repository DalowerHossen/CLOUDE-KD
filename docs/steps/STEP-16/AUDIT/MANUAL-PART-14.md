<!-- path: docs/steps/STEP-16/AUDIT/MANUAL-PART-14.md -->
# Manual reading, part 14 (features 1288 to 1386, the lines that are Bengali only)

Read against the code and the STEP 10 to 12 notes on 2026-10-27; nothing was opened in a browser. The STEP 10 decision D19 says that no processor adapter was run against a real sandbox when it was written; the payment flow was checked with fake processors and an in-memory database.

| No | Feature | Result | Evidence or note |
|---|---|---|---|
| 1329 | Custom gateway registration (admin UI) | check in browser | a `custom` webhook adapter exists (`/api/webhooks/custom`); a screen that registers a new gateway was not found |
| 1333 | Custom gateway webhook configuration | partial | the webhook route exists, configuration per gateway not read |
| 1334 | Custom gateway refund flow | check in browser | |
| 1336 | Custom gateway test mode | check in browser | |
| 1375 | Manual transaction verification (admin) | check in browser | `/api/payouts/[id]/paid`, `/api/payouts/[id]/failed` exist for payouts |
| 1376 | Payment method visibility by country | present | `config/payment-methods.ts`, country rules in `config/countries.ts` |
| 1379 | Payment amount confirmation | check in browser | |
| 1384 | Payment timeout handling | present | `payment-review-expiry` job and `/api/payment-links/checkout/[token]/resume` |
| 1385 | Payment cancel handling | present | `/api/payouts/[id]/cancel`; checkout cancel is handled in the checkout slot |

## Check in a browser or with a real sandbox: 1329, 1334, 1336, 1375, 1379.
