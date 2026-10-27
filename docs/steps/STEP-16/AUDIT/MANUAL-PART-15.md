<!-- path: docs/steps/STEP-16/AUDIT/MANUAL-PART-15.md -->
# Manual reading, part 15 (features 1387 to 1485, the lines that are Bengali only)

Read against the code and the STEP 10, 13 and 14 notes on 2026-10-27; nothing was opened in a browser.

| No | Feature | Result | Evidence or note |
|---|---|---|---|
| 1387 | Double submit and duplicate charge guard | present | every payment has an idempotency key (project rule 14); `services/payment/payments.ts` |
| 1388 | Payment race condition lock | present | row locks (`for update`) and unique indexes (`migrations/S10_001_payment_core.sql`) |
| 1400 | Payment record audit log | present | `services/payment/payment-events.ts` and the audit trail |
| 1405 | Owner contact details on the receipt | partial | the receipt (`lib/pdf/receipt-pdf.tsx`) shows the company name and reference; contact details were not seen |
| 1407 | Payment method details on the receipt | present | method and processor name |
| 1408 | Tax breakdown on the receipt | not found | |
| 1413 | Refund approval workflow, staff to owner | present | `/api/refunds/[id]/decision` |
| 1414 | Refund creates a credit note automatically | not found | the refund service does not touch credit notes |
| 1415 | Refund updates the invoice status | check in browser | STEP 10 recorded a missing contract: "reverse a payment on an invoice" (R1) |
| 1416 | Refund adjusts the wallet | check in browser | `/api/wallet` |
| 1418 | Refund after settlement | check in browser | `app/api/integrations/settlement` |
| 1424 | Payment allocation audit | present | table `payment_allocations` (unique per payment and invoice) |
| 1425 | Overpayment becomes a credit balance | check in browser | |
| 1439 | Payment link re-issue | check in browser | `/api/payment-links/[id]` has revoke; re-issue was not found |
| 1440 | Payment link revoke | present | `revokePaymentLink` |
| 1441 | Payment link view and click tracking | check in browser | |
| 1444 | Owner logo and colour on the checkout page | check in browser | `components/payment/checkout-slot.tsx` |
| 1445 | Invoice summary on the checkout page | present | `components/client/pay-panel.tsx` |
| 1446 | Payment method choice on the checkout page | not built by design | STEP 13 decision D10: the method is chosen by routing (STEP 10), not by the payer |
| 1452 | Mobile-optimised checkout page | check in browser | |
| 1476 | Wallet balance, real time, per tenant | check in browser | `/api/wallet`, `/api/wallet/ledger` |

## Not found or not built: 1408, 1414, 1446. Check in a browser or with a real sandbox: the rest of the "check" rows.
