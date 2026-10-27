<!-- path: docs/steps/STEP-16/AUDIT/MANUAL-PART-10.md -->
# Manual reading, part 10 (features 892 to 990, the lines that are Bengali only)

Read against the code and the STEP 09 decisions on 2026-10-27; nothing was opened in a browser. Results: present, partial, not found, not built (recorded by the owner), check in browser. A feature that depends on a job runs only when that job is scheduled (see finding 1 in `CONFIRMED_FINDINGS.md`).

| No | Feature | Result | Evidence or note |
|---|---|---|---|
| 894 | PDF regenerate against archive policy | present | the invoice keeps a snapshot of what was sent (`readSnapshot`, job `invoice-snapshots`) |
| 897 | Estimate create, edit, delete | present | `/api/estimates` |
| 898 | Estimate duplicate | partial | revise, restore, void and convert exist (`/api/estimates/[id]/...`); a plain duplicate was not seen |
| 900 | Public estimate approval by token link | present | `/api/portal/estimate/decide` (STEP 13) |
| 903 | Estimate auto-expire | present | `services/estimate/estimates.ts`, job `estimate-expiry` |
| 907 | Estimate notes and terms | present | shared terms and notes (`lib/invoice/terms.ts`) |
| 913 | Credit note e-mail | present | template `client.credit-note` (STEP 13 D14) |
| 916 | Debit note create | present | `/api/invoices/[id]/debit-note`, invoice kind `debit_note` |
| 917 | Debit note adjusts the invoice | present | the debit note is linked to its invoice |
| 921 | Proforma converts to invoice | present | `/api/invoices/[id]/convert` |
| 923 | Proforma validity period | not found | no validity date on an invoice, only a due date |
| 925 | Advance or deposit invoice | present | `/api/invoices/[id]/deposit`, kind `deposit` |
| 926 | Deposit offset against the final invoice | present | `/api/invoices/[id]/credits` |
| 928 | Deposit receipt | check in browser | the generic payment receipt |
| 932 | Recurring invoice start and end date | present | `startDate`, `endDate` in `services/invoice/recurring.ts` |
| 933 | Recurring pause and resume | present | status `paused`; also pauses by itself after three failed runs |
| 934 | Recurring history | check in browser | |
| 939 | Installment automatic invoices | present | table `installments` (`migrations/S09_010_installments.sql`), `/api/invoices/[id]/installments` |
| 940 | Installment progress tracking | present | the same route |
| 941 | Installment late fee | check in browser | invoice late fees exist (`/api/invoices/late-fees`); whether an installment gets one was not read |
| 942 | Project create, edit, archive | present | `/api/projects` |
| 943 | Project client link | present | `components/project/project-form.tsx` |
| 948 | Project profitability report | not built | STEP 09 decision: no cost rates exist |
| 949 | Budget against actual | partial | budget hours and amount are fields of a project; no comparison report was found |
| 950 | Project timeline | partial | milestones only (`/api/projects/[id]/milestones`) |
| 953 | Time entry edit and delete | present | `/api/time/[id]` |
| 954 | Time entry linked to project and client | present | `/api/time` |
| 955 | Time entry tags or categories | not found | |
| 957 | Timesheet approval, staff to owner | present | `/api/time/submit`, `/api/time/decide` |
| 962 | Pick billable hours, add to invoice | present | `/api/projects/[id]/bill`, `/api/projects/unbilled` |
| 964 | Hourly rate override per line | present | `components/project/bill-form.tsx` |
| 965 | Billable against non-billable time | present | billing types hourly, fixed, retainer, non_billable (`lib/project/input.ts`) |
| 967 | Retainer and prepaid hour tracking | present | `retainerHours` on a retainer project |
| 969 | Time entries map to invoice lines | present | the bill form |
| 972 | Client edit | present | `/api/clients/[id]` |
| 975 | Client reactivate | present | `/api/clients/[id]/status` |
| 976 | Inline new-client dialog from the invoice form | present | `/api/clients/quick` |
| 980 | Client contact person | present | `contacts` (up to ten) in `lib/crm/clients.ts` |
| 982 | Client phone | present | `phone` |
| 984 | Client website | present | `website` |

## Not built: 923, 948, 955. Partly built: 898, 949, 950.
