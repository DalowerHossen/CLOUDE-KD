# STEP 15 - Handoff: Accounting, Expenses, Payroll and HR

Branch `claude/clever-goldberg-8ncdae`. Sub-steps 15.1 to 15.10 are finished (see `PROGRESS.md`). Decisions D1 to D16 are in `DECISIONS.md`, checks in `VERIFY.md`, requests to other STEPs in `DEPENDENCY_REQUESTS.md` (R1 to R9).

## 1. Whole-STEP verification (the "Verification" line of SCOPE.md)

| Line of SCOPE.md                                                  | How it was checked                                                                                                                                           | Result                                   |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| Trial balance sums to zero after seeded activity                  | `step15-reports.ts`, `step15-report-tables.ts`, `step15-posting.ts`; the case table in VERIFY.md (debit 11,900 = credit 11,900)                              | passes                                   |
| Each seeded invoice and payment yields the expected journal lines | case table in VERIFY.md, `step15-posting.ts` (10 checks)                                                                                                     | passes (pure rules)                      |
| Posting into a closed period is refused                           | `sql/assertions/s15_003_periods.sql` (database refuses), `step15-periods.ts`                                                                                 | passes                                   |
| Second pay run for the same employee and period is refused        | `sql/assertions/s15_011_pay_runs.sql` (overlap guard)                                                                                                        | passes                                   |
| Payslip opens only through a valid token                          | design: portal door `resolvePortalAccess`, tokens service, 120 second signed link; table rules in `s15_012_employee_portal.sql`, rules in `step15-portal.ts` | NOT run end to end (needs a running app) |
| Net pay equals gross minus tax and deductions                     | `step15-payroll-calc.ts` (15 checks), `step15-payroll-runs.ts` (8 checks)                                                                                    | passes                                   |

Final runs on the last commit: `scripts/db-apply.sh --clean` (all 13 migrations and assertions), all 14 `scripts/verify/step15-*.ts` scripts, `tsc --noEmit` (larger heap, R8), full `eslint`, `bash scripts/check-all.sh`: clean.

Not run because there is no running app, database server with the platform, or PDF runtime in this environment: every route and page, the encryption round trip, the storage round trip, the approval service, the event runner delivering the events, PDF drawing (payslip and report PDFs), e-mail sending, the portal one-time code and rate limits. The Integrator must run these (see section 8).

## 2. Posting rules (events consumed, one entry per business source key)

Handler `workers/s15/accounting-posting.event.ts`; table in `services/accounting/posting-rules.ts` (`POSTING_RULES`); accounts come from the company's `account_mappings`.

| Event                  | Source key                   | Debit                                                                  | Credit                                |
| ---------------------- | ---------------------------- | ---------------------------------------------------------------------- | ------------------------------------- |
| `invoice.sent`         | `invoice:<id>:sent`          | receivable (total)                                                     | revenue (total less tax), tax payable |
| `invoice.voided`       | reverses the sent entry once | reversal of the entry                                                  |                                       |
| `payment.captured`     | `payment:<id>:captured`      | direct: bank; through wallet: wallet balance (net) and processing fees | receivable (gross)                    |
| `payment.refunded`     | `refund:<id>`                | refunds (contra revenue)                                               | bank or wallet balance                |
| `payout.paid`          | `payout:<id>:paid`           | bank (net), processing fees                                            | wallet balance (amount)               |
| `dispute.lost`         | `dispute:<id>:lost`          | chargebacks                                                            | bank or wallet balance                |
| `expense.created`      | `expense:<id>`               | expense account, input tax                                             | payables or bank if paid              |
| `payroll.run_approved` | `payroll:<run>:approved`     | salaries (gross), employer taxes                                       | payroll liabilities                   |
| `payroll.run_paid`     | `payroll:<run>:paid`         | payroll liabilities (net)                                              | bank                                  |

Also posted by this STEP directly (not by events): manual journals, year-end close, recurring entries, asset depreciation (`asset-depreciation:<company>:<month>`), asset disposal (`asset-disposal:<asset>`), reconciliation adjustments. Not posted (no event in the contract, R1): credit notes, debit notes, payout reversal.

## 3. Reports

Accounting (CSV, Excel, PDF, audited export): trial balance, general ledger, account ledger, profit and loss, balance sheet, cash flow, aged receivables, aged payables, tax summary, financial ratios, expense reports, comparative periods. Bank: reconciliation report. Assets: register as of a date, depreciation by category and month, assets by category, disposals, warranties. Budgets and intelligence: budget variance, cash forecast (30/60/90 days), trend forecast, business intelligence (margins, top clients, ratios, health score), consolidated profit and loss and balance sheet. Tax: sales tax by jurisdiction, VAT/GST return, withholding by payee, quarterly provision, tax paid against due, filing data. Audit pack (gzip JSON with manifest checksums). Payroll: run summary, register by employee, tax withheld per employee, payroll tax by quarter, annual statement. HR: performance report. Details and limits are in D6 to D16.

## 4. Payroll tax settings

The platform ships no tax rates. The owner enters rules in `/payroll/settings`: flat (rate on taxable or gross pay, optional yearly wage cap, extra rate above a yearly threshold) or bracket (annual brackets on annualised taxable pay after a yearly exemption); kinds are income tax, employee contribution, employer contribution (a company cost, not deducted from net pay). Caps and thresholds use the year to date taken from earlier approved and paid runs. Payroll settings: pay frequency (weekly, every two weeks, twice a month, monthly), overtime multiplier 1 to 5 and optional hour limit, standard hours per month, rounding (none, cent, dollar). Details: D13, D14.

## 5. Files, migrations, contracts

- Migrations `S15_001` to `S15_013` (with `_down`), assertions `sql/assertions/s15_001..013_*.sql`. Order of building: chart_journals, posting, periods, report_views, expenses, reconciliation, assets, budgets_entities, tax_audit, payroll_people, pay_runs, employee_portal, hr.
- Services: `services/{accounting,expense,reconciliation,asset,budget,taxfiling,payroll,hr}/`. Pure rules sit next to the services (`*-rules.ts`, D1).
- Routes under `app/api/{accounting,expenses,payroll,hr}/**` and `app/api/payroll/portal/**` (public, token based). Pages under `app/(dashboard)/{accounting,expenses,payroll,hr}/**` and the employee portal `app/(client-portal)/p/[token]/`.
- Cron jobs `cron/jobs/s15-{assets,budgets,expenses,payroll,recurring,tax}.ts`. Event worker `workers/s15/accounting-posting.event.ts`.
- Contracts provided: the accounting contract (`types/contracts`, 15.2), events `payroll.run_approved`, `payroll.run_paid`, `expense.created` (shapes in D4), OTP recipient resolver for document type `payslip`, PDF template `payslip` (`lib/pdf/payslip-pdf.tsx`).
- Fragments: `config/permissions/s15-{accounting,payroll,hr}.ts`, `config/approval/s15-accounting.ts` (rules `budget.approve`, `payroll.run.approve` and the journal rules), `config/nav/s15.ts`, `lib/i18n/strings/en/s15-{accounting,expenses,payroll,hr}.ts`.
- Seeds and env: no new environment variables.

## 6. Dependency requests

R1 events for credit notes, debit notes, payout reversal; R2 shapes of the events published here (no change needed); R3 approval by a person outside the company; R4 dimensions (department, cost centre, project) on journal lines; R5 scheduled accounting reports; R6 OCR call into `applyOcrResult`; R7 bank feed call into `importFeedBatch`; R8 TypeScript heap (`NODE_OPTIONS=--max-old-space-size=4096` or more in the `typecheck` script and CI); R9 one line in `emails/catalog.ts` for `payrollEmailTemplates`. Full text in `DEPENDENCY_REQUESTS.md`.

## 7. Known issues and not built

- Needs a running app to confirm: see section 1.
- Not built (each recorded in DECISIONS): period reopen through the approval service (R3), department and project dimension in the ledger (R4), scheduled report e-mail (R5), OCR hook (R6), bank feed (R7), credit and debit note posting (R1), partial-month depreciation, revaluation, multiple books and GAAP/IFRS checks, W-2 and 1099 file layouts, jurisdiction filing formats, payroll reversal, automatic pay runs, payroll provider hook, public holiday calendar for leave, final settlement calculation, experience and resignation documents, review cycle scheduling, leave decision e-mails, accountant review mode per period, petty cash, check printing.
- Until R9 is applied the employee notice e-mails after payment fail and are logged; nothing else is affected.

## 8. What the Integrator must regenerate or run

1. Merge the branch; run `npm run gen` (permissions, nav, approval, strings, cron, worker and register picks) and commit the generated files.
2. Apply the migrations in order with `scripts/db-apply.sh` (assertions run with it); regenerate `types/database.ts`.
3. Apply R8 (heap) and R9 (e-mail catalog line); decide R1, R3 to R7.
4. Run the checks that need a running app: the pages and routes, payslip opening only through a valid link and the same answer for an expired, revoked or unknown link, one-time code and rate limits, event delivery to the posting worker, PDF drawing, storage and encryption round trips.
5. Run `bash scripts/check-all.sh`, full `eslint`, and `tsc --noEmit` with the larger heap.
