<!-- path: docs/steps/STEP-16/AUDIT/MANUAL-PART-30.md -->
# Manual reading, part 30 (features 2872 to 2970, the lines that are Bengali only)

Read against the code and the STEP 15 notes on 2026-10-27; nothing was opened in a browser. Expense report keys in the code: summary, by_category, by_employee, tax_deductibility, policy_violations (`services/expense/reports.ts`). Payroll report keys: summary, register, tax_by_employee, quarterly_tax, annual (`services/payroll/reports.ts`).

| No | Feature | Result | Evidence or note |
|---|---|---|---|
| 2876 | Payroll budget against actual | partial | budgets and variance exist in accounting (`/api/accounting/budgets/[id]/variance`); no payroll-specific report |
| 2878 | Employee pay slip view and download | present | `/api/payroll/portal`, `/p/[token]/payslip/[itemId]` |
| 2879 | Employee tax declaration form | present | `/api/payroll/portal/declaration`, `components/payroll/declaration-form.tsx` |
| 2880 | Employee bank account update request | not found | |
| 2881 | Employee leave request | present | `/api/payroll/portal/leave`, `components/payroll/leave-form.tsx` |
| 2882 | Employee payment history | check in browser | |
| 2884 | Employee profile update request | not found | |
| 2889 | Leave approval workflow | present | `/api/hr/leave/requests/[id]/decide` |
| 2895 | Public holiday customisation per tenant | not found | no holiday code |
| 2907 | Payroll trend report (MoM, YoY) | partial | `summary` and `annual`; no month-on-month comparison |
| 2908 | Payroll budget report | not found | |
| 2914 | Department create, edit, delete | present | `/api/hr/departments` |
| 2915 | Department head assignment | not found | |
| 2916 | Position or designation create | present | `/api/hr/positions` |
| 2919 | Location and branch management | not found | |
| 2932 | Expense edit and delete | present | `/api/expenses/[id]` |
| 2943 | Expense reimbursement to bank payment | check in browser | the expense page has a paid state |
| 2946 | Recurring expense pause and resume | present | `/api/expenses/recurring/[id]` |
| 2947 | Recurring expense history | check in browser | |
| 2950 | Expense policy violation alert | present | report `policy_violations`, flags on the expense |
| 2951 | Expense policy approval override by the owner | present | STEP 15 D8: the owner approves a breach with a written reason |
| 2953 | Expense by category report | present | `by_category` |
| 2954 | Expense by department report | not found | no department key |
| 2955 | Expense by employee report | present | `by_employee` |
| 2956 | Expense trend report (MoM, YoY) | partial | `summary` for a period; no comparison |
| 2957 | Expense against budget report | present | accounting budget variance |
| 2958 | Expense tax deductibility report | present | `tax_deductibility` |
| 2959 | Expense receipt audit report | not found | |

## Not found: 2880, 2884, 2895, 2908, 2915, 2919, 2954, 2959. Partly built: 2876, 2907, 2956.
