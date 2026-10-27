<!-- path: docs/steps/STEP-16/AUDIT/MANUAL-PART-17.md -->
# Manual reading, part 17 (features 1585 to 1683, the lines that are Bengali only)

Read against the code and the STEP 13 and 14 notes on 2026-10-27; nothing was opened in a browser.

| No | Feature | Result | Evidence or note |
|---|---|---|---|
| 1591 | Service completion date | present | `/api/portal/delivery` (the client confirms delivery) |
| 1596 | IP log for every view | partial | views are recorded; whether the address is kept for each view was not read |
| 1597 | Payment page visit log | check in browser | |
| 1598 | Full event timeline per invoice | partial | STEP 13 D10: the timeline is derived from the status (sent, viewed, paid), not from an event table |
| 1601 | Client subscription plan create, per tenant | present | `/api/subscriptions/client/plans` |
| 1603 | Plan feature list for display | present | the same |
| 1610 | Recurring payment processed automatically | not built | STEP 14: charging a stored card automatically is not built; each cycle makes and sends an invoice |
| 1612 | Failed charge notification to owner and client | partial | dunning attempts are notices (STEP 14); needs the subscription jobs scheduled |
| 1616 | Subscription term tracking | present | `/api/subscriptions/client` |
| 1619 | Subscription churn report | present | `/api/subscriptions/analytics`, `/api/subscriptions/client/report` |
| 1631 | Missed installment handling | present | `lib/payment/bnpl-rules.ts`, job `bnpl-check` (not scheduled yet) |
| 1638 | Payment fraud scoring, rule based | present | `lib/security/fraud-engine.ts` (STEP 10 D20 says the engine is smaller than the list names) |
| 1640 | Unusual amount flag | present | the same |
| 1641 | New client payment limit | check in browser | |
| 1644 | Manual review of high-risk payments | present | `/api/admin/payment-review` |
| 1650 | Payment discrepancy alert | check in browser | |
| 1654 | Gateway payment report | check in browser | `/api/admin/processors` |
| 1655 | Payment method breakdown report | check in browser | |
| 1661 | Wallet transaction report | present | `/api/wallet/ledger` |
| 1662 | Platform fee income report | present | `/api/subscriptions/analytics`, `app/(admin)/admin/revenue` |
| 1664 | FX gain and loss report | not built | no exchange rate provider (STEP 09) |

## Not built: 1610, 1664. Partly built: 1596, 1598, 1612.
