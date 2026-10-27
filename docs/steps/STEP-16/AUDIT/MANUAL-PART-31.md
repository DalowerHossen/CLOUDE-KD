<!-- path: docs/steps/STEP-16/AUDIT/MANUAL-PART-31.md -->
# Manual reading, part 31 (features 2971 to 3069, the lines that are Bengali only)

Read against the code and the STEP 15 decisions on 2026-10-27; nothing was opened in a browser. The accounting module has its own verify scripts (`scripts/verify/step15-*`).

| No | Feature | Result | Evidence or note |
|---|---|---|---|
| 2999 | Debit note makes a journal automatically | present | automatic posting rules (`/api/accounting/posting/rules`); the debit note is an invoice kind |
| 3008 | P&L by department or cost centre | not found | the statements are per entity and period |
| 3009 | P&L by project | not found | |
| 3017 | Balance sheet drill-down | check in browser | `/api/accounting/entities/statements/[kind]` |
| 3025 | Cash flow period selection | present | statements take a period |
| 3034 | Fixed asset register | present | `/api/accounting/assets` |
| 3035 | Depreciation schedule | present | `/api/accounting/assets/[id]/schedule`, job `asset-depreciation` (not scheduled yet) |
| 3036 | Budget against actual report | present | `/api/accounting/budgets/[id]/variance` |
| 3037 | Variance analysis report | present | the same, with export |
| 3043 | Bank transaction matching, automatic and manual | present | `/api/accounting/reconciliation/.../auto-match`, `confirm`, `unmatch` |
| 3048 | Unmatched transaction queue | present | `/api/accounting/reconciliation/queue` |
| 3050 | Reconciliation adjustment entry | check in browser | `/api/accounting/reconciliation/[id]/complete` |
| 3057 | Asset serial number | present | STEP 15 D10 |
| 3058 | Asset warranty information | present | STEP 15 D10 |
| 3067 | Accumulated depreciation tracking | present | STEP 15 D10 (contra asset account) |

## Not found: 3008, 3009.
