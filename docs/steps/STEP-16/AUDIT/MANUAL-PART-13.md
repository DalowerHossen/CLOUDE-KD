<!-- path: docs/steps/STEP-16/AUDIT/MANUAL-PART-13.md -->
# Manual reading, part 13 (features 1189 to 1287, the lines that are Bengali only)

Read against the code and the STEP 09 decisions on 2026-10-27; nothing was opened in a browser. Jobs run only when scheduled (finding 1 in `CONFIRMED_FINDINGS.md`).

| No | Feature | Result | Evidence or note |
|---|---|---|---|
| 1189 | Saved filter presets per user | present | `/api/reports/presets` |
| 1192 | Payment reminder in the tenant time zone, 9 in the morning | partial | STEP 09: reminders go out in the company time zone, outside quiet hours (20:00 to 08:00), on a ladder of day offsets; the hour is not fixed at 9; job `invoice-reminders` |
| 1200 | Late fee configuration per client and per invoice | partial | one late fee setting per company (`/api/invoices/late-fees/settings`); no per-client or per-invoice override was found |
| 1201 | Late fee maximum cap | check in browser | |
| 1207 | Multi-currency FX gain and loss | not built | STEP 09: no exchange rate provider (source could not be read); display currencies only |
| 1209 | Renewal reminder e-mail | present | see feature 715 |
| 1210 | Tax rate create, edit, delete | present | `/api/invoices/tax/rates` |
| 1212 | Compound and multi-tax calculation | present | see feature 797 |
| 1216 | Tax exemption certificate upload | present | `/api/invoices/tax/exemptions/[clientId]/certificate` |
| 1217 | Fiscal year setting | present | fiscal year start month (STEP 15 D5) |
| 1218 | Rounding rule configuration | present | `lib/invoice/rounding.ts`, tax settings form |
| 1219 | Banker's rounding option | present | `half_even` |
| 1220 | Line against total rounding policy | present | tax settings form |
| 1225 | 1099-K and merchant tax reporting | not found | |
| 1226 | Mandatory invoice fields by country | not found | a country field exists, no per-country rule set |
| 1232 | Batch progress bar, real time | check in browser | `app/(dashboard)/invoices/batches` |
| 1233 | Per-e-mail success or failure result | present | the items of a batch carry their own status (`lib/invoice/batch.ts`) |
| 1237 | Batch history log | present | `/api/invoices/batches` |
| 1239 | Bulk archive | not found | bulk actions are send, remind, delete drafts, void and tag |
| 1241 | Bulk status change | partial | send and void only |
| 1242 | Bulk action confirmation with the count | partial | `components/invoice/bulk-selection.tsx` asks to confirm void and delete, without the number |
| 1250 | Default gateway priority per tenant | present | routing rules (`/api/admin/processors/routing`) |
| 1258 | Gateway webhook replay window (plus or minus 5 minutes) | present | webhook helpers with a time window and replay check (verified in `step04-core`) |
| 1260 | Gateway status dashboard per tenant | partial | a gateway page exists (`app/(dashboard)/integrations/gateway`); the health board is platform wide (`/api/admin/processors/health`) |

## Not built or not found: 1207, 1225, 1226, 1239. Partly built: 1192, 1200, 1241, 1242, 1260.
