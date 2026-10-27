<!-- path: docs/steps/STEP-16/AUDIT/MANUAL-PART-18.md -->
# Manual reading, part 18 (features 1684 to 1782, the lines that are Bengali only)

Read against the code and the STEP 13 notes on 2026-10-27; nothing was opened in a browser. Not built, recorded by the owner (STEP 13 D4, D10, D13): partial payment input (1730), buy now pay later on the page (1729), bank transfer as a method, wallet buttons, the success page with confetti (1734), "pay another invoice" in the hub, receipts in the hub, "pay all unpaid", the 30-day remember-this-device bypass (1687).

| No | Feature | Result | Evidence or note |
|---|---|---|---|
| 1705 | Payment terms and due date on the invoice page | present | `components/client/views/invoice-view.tsx` |
| 1717 | Invoice-opened notification to the owner | check in browser | `recordInvoiceViewed` records the view; a notification was not read |
| 1718 | Mobile-optimised invoice view | check in browser | |
| 1739 | Mobile-optimised payment page | check in browser | |
| 1742 | Branded estimate view page | present | `components/client/branded-frame.tsx` |
| 1748 | Approval confirmation page | present | `/api/portal/estimate/decide`, `app/(client-portal)` |
| 1755 | Receipt print | check in browser | `/api/portal/pdf`, print rules in `styles/globals.css` |

## Not built, recorded by the owner: 1687, 1729, 1730, 1734.
