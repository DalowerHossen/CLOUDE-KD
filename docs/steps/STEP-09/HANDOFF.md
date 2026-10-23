# STEP 09 handoff - Invoicing Core, PDF, Projects and Reports

Branch: claude/clever-goldberg-8ncdae (contains STEP 01 to 09).

## FEATURE_LIST items implemented (line ranges of SCOPE.md)

- Part 3 955-1190 (A to E): invoices (create, edit drafts with autosave and revisions, copy, trash and restore, status machine, manual status with reason, tags and categories, notes, terms, PO number, ship-to, display currency with a frozen exchange rate), items and the calculation engine (exclusive and inclusive prices, discount before or after tax, compound taxes, document discount shared over lines, shipping with tax, withholding, rounding per line or on the total with half-up or half-even at 2, 3 or 4 decimals, cash rounding, amount in words), gap-free numbering per company and document type with year option and owner-only manual number, US layout in four looks with Letter and A4, branding, bank details to pay into, PDF with watermark and page numbers, immutable PDF snapshot on send; estimates with client decision and signature record, proforma, credit notes, debit notes, deposits and their use on the final invoice; recurring invoices and installment plans; reminders, late fees and write-off; projects, team, milestones, budgets, timer and timesheets with approval and period lock; billing project time, milestones, retainer and expenses.
- Part 3 1363-1453 (K dashboard, L reports): dashboard with period comparison, cards, charts, aging, attention lists, recent activity, quick actions, global search, widget layout per person, full screen; ten reports with total rows, comparison, CSV, Excel and PDF, saved presets and scheduled e-mail.
- Part 3 1454-1501 (M reminders, late fees, other billing, N tax): see above; tax rates, templates, settings, client exemptions with certificate, reverse charge, tax number check fields, tax summary report.
- Part 3 1502-1516 (O): batch invoicing for many clients and bulk actions (send, remind, delete drafts, void, tag) with progress, schedule, retry, cancel and a double-send guard.
- Part 5 2245-2272 (G1-G2): invoice integrity (database triggers, append-only revisions, events and snapshots) and the approval workflow data side (staff send waits for the owner).
- Part 9 4140-4180 (P Asia tax and localization, tax parts) and 4203-4239 (R1 invoice edge cases): tax setup and display currency; zero-amount invoices, back-dated invoices, walk-in clients, void after partial payment, negative totals refused.
- Not built, with reasons (DECISIONS): an exchange rate provider (source could not be read, DEPENDENCY_REQUESTS 8); the Unicode font for PDFs (folder given by `PDF_FONT_DIR`); stock return for credit notes (event missing, DEPENDENCY_REQUESTS 9); editing the template of a recurring schedule (end it and start a new one); recurring forecast and project profit reports (no cost rates exist); expense, profit and loss and cash flow reports (STEP 15 registers them).

## Migrations (S09_001 to S09_017, each with a `_down` file and an assertion in `sql/assertions/`)

| File                  | Content                                                                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| S09_001_tax_fx        | `tax_rates`, `tax_settings`, `client_tax_exemptions`, `fx_rates`; `kd_fx_rate`                                                           |
| S09_002_invoices_core | `invoices`, `invoice_items`, `invoice_revisions`, `invoice_events`, `invoice_payment_links`; immutability triggers                       |
| S09_003_numbering     | `invoice_sequences`; `kd_next_doc_number`, `kd_invoice_assign_number`, `kd_peek_doc_number`                                              |
| S09_004_invoice_search| `kd_invoice_search` (keyset pages)                                                                                                       |
| S09_005_send_payments | `kd_invoice_send`, `kd_invoice_apply_payment`, `kd_invoice_mark_overdue`; `tax_settings.remit_to_enc`                                    |
| S09_006_invoice_snapshots | `invoice_snapshots` (append only)                                                                                                    |
| S09_007_estimates     | `estimates`, `estimate_events`; `kd_estimate_send`, `kd_estimate_decide`, `kd_estimate_expire`                                           |
| S09_008_credits       | `credit_notes`, `credit_applications`; `kd_credit_issue`, `kd_credit_apply`, `kd_credit_void`                                            |
| S09_009_recurring     | `recurring_schedules`, `recurring_runs`, `invoices.recurring_run_id`; `kd_recurring_claim`, `_complete`, `_fail`                          |
| S09_010_installments  | `installment_plans`, `installments`; `kd_installments_replace`; overdue sweep also looks at installments                                 |
| S09_011_dunning       | `reminder_settings`, `reminder_log`, `reminder_holds`, `late_fee_settings`, `late_fees`, `invoice_writeoffs`; `kd_invoice_writeoff`      |
| S09_012_projects      | `time_settings`, `projects`, `project_members`, `project_milestones`, `time_entries`; time guard trigger                                 |
| S09_013_time_billing  | `kd_time_claim`, `kd_time_link`, `kd_time_release`, `kd_time_release_stale`                                                              |
| S09_014_dashboard     | `dashboard_layouts`; `kd_dashboard_stats`, `kd_dashboard_series`                                                                         |
| S09_015_reports       | `report_presets`, `report_schedules`                                                                                                     |
| S09_016_batches       | `invoice_batches`, `invoice_batch_items`; `kd_batch_claim`, `kd_batch_item_result`, `kd_batch_cancel`, `kd_batch_retry`                  |
| S09_017_client_hooks  | client balance trigger (`kd_sync_client_balance`), `kd_invoice_merge_client`; the three guards let the merge change only `client_id`     |

All tables have the standard columns (`version` included), RLS with default deny, and are closed to `authenticated`; all functions are `security definer` and granted to `service_role` only. Money columns are `numeric(18,4)`.

## Contracts provided

- `invoices` (`getForPayment`, `applyPayment`, `markDisputed`, `snapshot`) and `pdf` (`render(kind, data)`; kinds `invoice` and `estimate` registered; other STEPs register their kinds with `registerPdfRenderer`) in `services/invoice/register.ts`.
- `fx` (`rateAt`, `convertForDisplay`) in `services/fx/register.ts`.
- Extension points for other STEPs: `registerReport` (`services/report/reports.ts`), `registerBillableExpenseProvider` (`services/project/expense-hook.ts`), `registerPdfRenderer` (`lib/pdf/pdf-engine.ts`).
- Hooks of STEP 08 registered: see DEPENDENCY_REQUESTS 13.

## Domain events

Published: `invoice.created`, `invoice.sent` and `invoice.voided` (both with `lines` for STEP 08 stock), `invoice.viewed`, `invoice.paid`, `invoice.partially_paid` (payload `source` is `credit_note`, `deposit` or `write_off` when it was not cash), `invoice.overdue`, `estimate.sent`, `estimate.approved`, `estimate.rejected`. Consumed: none.

## Cron jobs

| Name                   | Schedule (UTC)  | What it does                                                         |
| ---------------------- | --------------- | -------------------------------------------------------------------- |
| fx-rates               | 05:05 daily     | refreshes rates when a provider is registered (none today)           |
| invoice-approvals      | every 5 minutes | sends invoices the owner approved                                    |
| invoice-overdue        | hourly :17      | marks late invoices overdue (also late installments)                 |
| invoice-snapshots      | every 10 minutes| files the PDF of sent invoices that have none                        |
| invoice-recurring      | every 30 minutes| makes the recurring invoices that are due                            |
| invoice-reminders      | hourly :07      | sends payment reminders (quiet hours, business days)                 |
| invoice-late-fees      | 01:23 daily     | proposes (or applies) late fees                                      |
| invoice-batches        | every minute    | works through batch items                                            |
| estimate-expiry        | 00:05 daily     | expires estimates past their date                                    |
| time-release-claims    | hourly :41      | gives back time claimed for an invoice that was never made          |
| report-schedules       | hourly :53      | sends scheduled reports                                              |

## Permissions (`config/permissions/s09-*.ts`)

`invoice.{read,create,update,delete,override_status,send,void,writeoff}`, `estimate.{read,create,update,delete,send,convert,void}`, `credit.{read,create,issue,apply,void}`, `recurring.{read,manage}`, `installment.manage`, `reminder.{manage,send}`, `latefee.manage`, `project.{read,manage,bill}`, `time.{log,settings}`, `report.{read,export,schedule}`, `tax.{read,manage}`. Owner-only by default: `invoice.override_status`, `invoice.void`, `invoice.writeoff`, `credit.issue`, `credit.apply`, `credit.void`, `estimate.void`, `reminder.manage`, `latefee.manage`, `time.settings`, all `report.*` and `tax.manage`.

Approval rule: `invoice.send` (L1): a staff member's invoice waits for the owner (`config/approval/s09-invoices.ts`).

## Report catalogue

Sales summary, revenue by client, revenue by item, invoices by status, payments received, unpaid invoices by age, credit notes, tax summary, time (by project or person), estimates. Others are added by `registerReport`.

## E-mail templates and environment

Templates: `invoice.sent`, `estimate.sent`, `invoice.reminder`, `report.ready` (in `emails/invoice/`). One optional variable: `PDF_FONT_DIR`.

## Pages and APIs

Pages: `/dashboard`, `/invoices` (+`new`, `<id>`, `tax` (+`clients/<id>`), `recurring` (+`new`, `<id>`), `reminders`, `late-fees`, `batches` (+`new`, `<id>`)), `/estimates` (+`new`, `<id>`), `/credit-notes` (+`<id>`), `/projects` (+`new`, `<id>`, `<id>/bill`, `unbilled`), `/timesheets`, `/reports` (+`<key>`).

APIs: `/api/invoices/*` (invoice, tax, fx, numbering, recurring, installments, reminders, late fees, write-off, batches, credits, deposit, debit note, convert), `/api/estimates/*`, `/api/credit-notes/*`, `/api/projects/*`, `/api/time/*`, `/api/reports/*` (dashboard, search, catalogue, run, presets, schedules). Every route is wrapped by `withApi` except the plain file answers on the allow list: the tax certificate file, `/api/pdf/invoices/<id>`, `/api/pdf/estimates/<id>`, `/api/pdf/credit-notes/<id>` and `/api/reports/<key>/export`.

## Owner steps (outside the code)

1. Fill the company profile, branding and invoice settings (STEP 07), then the tax rates, default tax codes and the bank details to pay into (Tax and rates).
2. Choose the exchange rate source if the company invoices with a display currency (enter rates by hand until a provider exists).
3. Mount a folder with `regular.ttf` and `bold.ttf` and set `PDF_FONT_DIR` if client names use letters outside Western European languages.
4. Decide reminder steps, quiet hours and late fee rules before switching them on; time rounding and the lock date for time sheets.
5. Give staff the permissions they need (reports are owner-only until granted).

## Known issues

None open. Limits that are documented decisions: dashboard sums use UTC days; a recurring schedule's template cannot be edited after creation; a credit note does not yet return goods to stock (event missing); `ClientService.getBilling` has no address lines.

## The Integrator must

Run `npm run gen`, apply the shared-file changes in DEPENDENCY_REQUESTS 1 to 4, run `bash scripts/integration-check.sh`, and then add STEP 09 to the nine scripts listed in item 4.
