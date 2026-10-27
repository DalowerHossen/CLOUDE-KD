<!-- path: docs/steps/STEP-16/AUDIT/MANUAL-PART-12.md -->
# Manual reading, part 12 (features 1090 to 1188, the lines that are Bengali only)

Read against the code and the STEP 09 decisions on 2026-10-27; nothing was opened in a browser. Reports are registered in `lib/reports` and by other STEPs (STEP 15 registers expense, profit and loss, and cash flow reports).

| No | Feature | Result | Evidence or note |
|---|---|---|---|
| 1090 | Supplier payment schedule | check in browser | |
| 1112 | Failed sync queue and manual retry | present | `/api/integrations/commerce/orders/[id]/retry`, `.../ignore` |
| 1113 | Sync status dashboard | present | `/api/integrations/commerce/log`, `app/(dashboard)/integrations/stores` |
| 1120 | Recent invoice list (last 10) | present | dashboard widget "recent activity" (`lib/reports/widgets.ts`) |
| 1121 | Recent payment list (last 10) | present | the same widget |
| 1126 | Invoice status pie chart | present | report `invoice_status` |
| 1127 | Top clients bar chart | present | report `revenue_by_client` |
| 1128 | Top products or services chart | present | report `revenue_by_item` |
| 1129 | Expense against revenue chart | check in browser | STEP 15 registers the expense reports |
| 1130 | Cash flow chart | check in browser | STEP 15 cash flow report |
| 1132 | Number paid | present | "key numbers" widget |
| 1133 | Number unpaid | present | the same widget |
| 1134 | Number overdue | present | the same widget |
| 1136 | Number of failed e-mails | not found | no such figure in the widgets |
| 1138 | Collection rate percent | check in browser | |
| 1140 | Batch-based performance | partial | the batch pages list results; no performance figure |
| 1141 | Date range filter | present | `lib/reports/ranges.ts` |
| 1144 | Dashboard layout saved per user | present | `/api/reports/dashboard/layout` |
| 1145 | Dashboard refresh, manual and automatic | partial | the page refreshes after edits; no automatic timer |
| 1146 | Dashboard full-screen mode | present | `components/charts/dashboard-board.tsx` |
| 1149 | Sales report by product | present | `revenue_by_item` |
| 1150 | Sales report by client | present | `revenue_by_client` |
| 1151 | Sales trend, month on month and year on year | present | `lib/reports/compare.ts` |
| 1152 | Sales by category | not found | |
| 1153 | Sales by staff or salesperson | not found | |
| 1154 | Payment summary report | present | `payments_received` |
| 1155 | Payment method breakdown | check in browser | STEP 10 registers payment reports |
| 1156 | Payment gateway breakdown | check in browser | |
| 1158 | Collection rate report | check in browser | |
| 1159 | Overdue report | present | `ar_aging` |
| 1160 | Expense summary report | present | `/api/expenses/reports/[report]` |
| 1161 | Expense by category | present | the same |
| 1162 | Expense trend | present | the same |
| 1163 | Accounts payable ageing report | present | `/api/bills/aging` |
| 1164 | Expense against budget | present | `/api/accounting/budgets/[id]/variance` |
| 1165 | Tax summary report | present | `tax_summary` |
| 1170 | Client summary report | present | `revenue_by_client`, client activity |
| 1171 | Client profit report | not built | STEP 09: no cost rates exist |
| 1172 | Client balance report | present | `ar_aging`, `/api/clients/[id]/statement` |
| 1173 | Client payment history report | present | `/api/clients/[id]/activity` |
| 1174 | Client activity report | present | the same |
| 1175 | Inventory valuation report | present | `/api/inventory/valuation` |
| 1177 | Stock movement report | present | `/api/inventory/movements` |
| 1178 | Low-stock report | present | `/api/inventory/reorder` |
| 1179 | Project profitability report | not built | STEP 09: no cost rates exist |
| 1180 | Time tracking report | present | `time_summary` |
| 1181 | Billable against non-billable report | check in browser | `time_summary` |
| 1182 | Project budget against actual | partial | see feature 949 |

## Not built or not found: 1136, 1152, 1153, 1171, 1179. Partly built: 1140, 1145, 1182.
