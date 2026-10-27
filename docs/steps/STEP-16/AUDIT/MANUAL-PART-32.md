<!-- path: docs/steps/STEP-16/AUDIT/MANUAL-PART-32.md -->
# Manual reading, part 32 (features 3070 to 3168, the lines that are Bengali only)

Read against the code and the STEP 15 decisions on 2026-10-27; nothing was opened in a browser. Insight reports in `services/budget`: trend, trend_forecast, seasonality, break_even, working_capital, forecast.

| No | Feature | Result | Evidence or note |
|---|---|---|---|
| 3073 | Budget against actual, real time | present | variance against the posted ledger (STEP 15 D11) |
| 3074 | Overspend alert at 80 and 100 percent | present | job `budget-alerts` (not scheduled yet) |
| 3076 | Budget approval workflow | present | `/api/accounting/budgets/[id]/decide` (STEP 15 D11) |
| 3082 | Accounting standard selection per tenant | not found | |
| 3088 | Prepaid expense tracking | not found | |
| 3091 | Inter-company transactions | present | `/api/accounting/entities/pairs` |
| 3093 | Consolidated financial statements | present | `/api/accounting/entities/statements/[kind]` |
| 3094 | Consolidation report | present | the same, with export |
| 3101 | Accounting period lock per module (AR, AP, GL) | present | STEP 15 D5: receivables and payables locks |
| 3102 | Financial year close wizard | present | `/api/accounting/years/[id]/close` |
| 3103 | Year-end adjusting entry | present | entry kinds `adjusting` and `closing` (STEP 15 D5) |
| 3104 | Year-end close checklist | present | `/api/accounting/years/[id]/checklist` |
| 3105 | Retained earnings roll-forward, automatic | present | the closing entry (STEP 15 D5) |
| 3120 | Legal archive export for auditors | present | `/api/accounting/audit-pack` |
| 3124 | Period close and open audit | present | `/api/accounting/periods/[id]/reopen` needs a reason; audited |
| 3127 | Periodic review schedule | not found | |
| 3144 | Trend analysis (MoM, YoY, QoQ) | present | insight report `trend` |
| 3145 | Seasonal pattern detection | present | insight report `seasonality` |
| 3146 | Break-even analysis | present | insight report `break_even` |
| 3147 | Working capital report | present | insight report `working_capital` |
| 3148 | Debt-to-equity ratio | not found | |
| 3149 | Current and quick ratio | not found | |
| 3155 | Multi-tenant company_id scope on every table | present | project rules 9 and 10, `scripts/check-migrations.mjs`, SQL assertions |
| 3161 | Tenant scope on shared tables | partial | platform-level tables have a nullable `company_id` by rule 9 |
| 3168 | Cross-tenant file access block | present | the storage contract and row-level security (STEP 05) |

## Not found: 3082, 3088, 3127, 3148, 3149. Partly built: 3161.
