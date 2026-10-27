<!-- path: docs/steps/STEP-16/AUDIT/MANUAL-PART-19.md -->
# Manual reading, part 19 (features 1783 to 1881, the lines that are Bengali only)

Read against the code and the STEP 13 and 14 notes on 2026-10-27; nothing was opened in a browser. STEP 13 decision D14 lists nine client templates: receipt, refund, estimate reminder, estimate expired, final notice, thank you, credit note, proforma and new link.

| No | Feature | Result | Evidence or note |
|---|---|---|---|
| 1784 | Estimate expiry e-mail | present | template `client.estimate-expired` |
| 1786 | Refund confirmation e-mail | present | template `client.refund` |
| 1788 | Subscription renewal e-mail | present | renewal reminders (`lib/payment/subscription-rules.ts`) |
| 1789 | Subscription cancel confirmation e-mail | check in browser | |
| 1791 | Credit note e-mail | present | template `client.credit-note` |
| 1792 | Proforma invoice e-mail | present | template `client.proforma` |
| 1802 | Customer's own favicon | not found | see feature 551 |
| 1804 | Customer's own secondary colour | not found | see feature 559 |
| 1805 | Customer's own accent colour | present | `accentColor` |
| 1809 | Logo size and format optimisation, automatic | not built | STEP 05: no image variants or conversion |
| 1812 | Branding auto-fill on the estimate | present | the estimate PDF reads the company profile |
| 1813 | Branding auto-fill on credit and debit notes | present | the invoice PDF serves all kinds |
| 1814 | Branding auto-fill on the receipt | present | `lib/pdf/receipt-pdf.tsx` shows the company name |
| 1818 | Branded checkout page | check in browser | see feature 568 |
| 1819 | Branded client hub | present | `components/client/branded-frame.tsx` |
| 1820 | Branded receipt | check in browser | see feature 569 |
| 1821 | Branded loading state | check in browser | `loading.tsx` in `app/(client-portal)` |
| 1838 | Custom domain add, per tenant | partial | see feature 657 |
| 1850 | Multi-tab session sync, real time | not found | only the theme listens to other tabs |
| 1851 | Token refresh race handling | check in browser | |
| 1853 | Bulk action confirmation with the count | partial | see feature 1242 |
| 1858 | Inline validation, real time, per field | present | forms validate with the same Zod schemas |
| 1863 | Field-level character count | partial | counters in the social composer; not in the other forms |
| 1875 | Strict policy on changes to past invoices | present | `/api/invoices/[id]/revisions`, a sent invoice keeps its snapshot |
| 1876 | Invoice approval workflow, staff to owner | present | job `invoice-approvals`, approval contract |
| 1877 | Estimate approval workflow | check in browser | |
| 1879 | Refund approval workflow | present | `/api/refunds/[id]/decision` |

## Not found or not built: 1802, 1804, 1809, 1850. Partly built: 1838, 1853, 1863.
