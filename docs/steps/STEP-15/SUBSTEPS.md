# STEP 15 - Sub-steps plan

Branch: `claude/clever-goldberg-8ncdae`, continued from the end of STEP 14 (STEPS 02 to 14 are not on `origin/integration` yet, so the branch is the only place where the contracts this STEP uses exist). Migration block `S15_*`. Every sub-step ends with lint, typecheck, `scripts/check-all.sh`, `scripts/db-apply.sh --clean` (when it has a migration), `scripts/run-assertions.sh s15` and its own `scripts/verify/step15-*.ts`.

FEATURE_LIST ranges (Part 8, written in Bengali, UI stays English): A payroll 2799-2913, B HR 2914-2930, C expenses 2931-2959, D chart of accounts and journals 2960-3004, E statements 3005-3040, F reconciliation 3041-3053, G fixed assets 3054-3070, H budgets 3071-3080, I multi-entity 3081-3095, J periods 3096-3108, K tax reporting 3109-3120, L audit 3121-3133, M forecasting and BI 3134-3154; Part 3 lines 1415-1426 (items 1160-1169); Part 9 lines 4203-4239. Each sub-step reads its exact lines first.

Security checks for all sub-steps: Z1 to Z14 of STEP_PROTOCOL section 6. Plus: journal lines are insert-only once posted and every entry balances (debit equals credit) in the database; a closed period refuses postings; payroll data is the highest sensitivity (fields encrypted with purpose `pii`, field-level permission, every view of a salary or payslip audited); money only through `Money`; rule 18 (no payment brand names) checked in code, strings and documents; no FOREIGN KEY from this STEP to a lower-numbered STEP's table other than allowed by the cross-STEP data rules (ids are plain UUID plus contract lookups).

Contracts consumed (present in `types/contracts/`): events, audit, locks, approval, permissions, tenant, storage, pdf, email, notification, tokens, invoices, payments, fx, encryption, jobs, auth, security, wallet. Provided: `accounting` (registered by `services/accounting/register.ts`; `repost(eventId)`). Events consumed: `invoice.created|sent|paid|partially_paid|voided`, `payment.captured|refunded`, `payout.paid|failed`, `expense.created`, `payroll.run_approved|run_paid`, and the wallet, subscription and settlement events of STEP 14 where they map to ledger money.

Known inputs from earlier STEPs (found while planning): there is no contract for OCR (STEP 16 sends receipt data through events), bank feeds (STEP 16 arrives as imported transactions), or tax rates by jurisdiction for payroll (this STEP keeps its own payroll tax tables, see DECISIONS). Payroll payments to employees have no payment rail: pay runs are paid by recording a bank transfer reference (the same manual path as the manual payout partner of STEP 14); a live rail is a request.

## 15.1 Chart of accounts and journals
- Goal: default chart (asset, liability, equity, revenue, expense, contra types; codes; parent groups), account CRUD with system accounts protected, journal entries and lines (debit equals credit enforced in the database by a deferred check and a posting function), draft and posted states, manual entry through the approval chain, reversal entry, duplicate detection hash, attachments via the storage contract, multi-line memo, numbering per year.
- Files: `migrations/S15_001_chart_journals.sql` (+ `_down`; `accounts`, `journal_entries`, `journal_lines`, `journal_attachments`, `kd_journal_post`), `sql/assertions/s15_001_chart_journals.sql`, `config/s15-accounting.ts`, `lib/accounting/{chart,journal}.ts`, `services/accounting/{accounts,journals,attachments}.ts`, `app/api/accounting/{accounts,journals}/**`, `scripts/verify/step15-journals.ts`.
- FEATURE_LIST: 2960-3004 (journals and chart).
- Done when: an unbalanced entry is refused by the database; a posted line cannot be updated or deleted (reversal only); the same entry content twice is flagged; trial balance of seeded entries sums to zero.

## 15.2 Automated posting
- Goal: posting rules table (event -> accounts) and event workers that turn domain events into balanced entries, idempotent by event id (unique source key), the `accounting` contract with `repost(eventId)`, accounts-receivable and revenue from invoices, cash and receivable from payments, refunds, payout and wallet movements, expense and payroll entries, tax payable lines, a failures list for events that cannot be posted.
- Files: `migrations/S15_002_posting.sql` (+ `_down`; `posting_rules`, `posting_log`), `sql/assertions/s15_002_posting.sql`, `lib/accounting/posting-rules.ts`, `services/accounting/{posting,register}.ts`, `workers/s15/*.event.ts`, `scripts/verify/step15-posting.ts` (case table for `VERIFY.md`).
- FEATURE_LIST: 2960-3004 (auto-posting items), MASTER_PROMPT journal entry.
- Done when: each case in the table gives the expected lines; a replayed event changes nothing; an event for a closed period posts into the next open period or is listed as failed, per rule (recorded in DECISIONS).

## 15.3 Periods
- Goal: fiscal year and periods, close and reopen (reopen needs approval and an audit entry), posting refused in a closed period, adjusting entries, year-end closing entry to retained earnings, lock dates, period checklist.
- Files: `migrations/S15_003_periods.sql` (+ `_down`; `fiscal_years`, `fiscal_periods`, trigger refusing closed-period lines), `sql/assertions/s15_003_periods.sql`, `lib/accounting/periods.ts`, `services/accounting/periods.ts`, `app/api/accounting/periods/**`, `cron/jobs/s15-periods.ts`, `scripts/verify/step15-periods.ts`.
- FEATURE_LIST: 3096-3108.
- Done when: a line dated in a closed period is refused by the database; year-end leaves revenue and expense at zero and moves profit to equity.

## 15.4 Statements and reports (a: statements, b: pages and exports)
- 15.4.a Goal: trial balance, general ledger, profit and loss, balance sheet, cash flow (indirect), AR and AP aging, tax summaries, comparatives, 15+ reports in total as pure functions over ledger sums with SQL views for speed.
  Files: `migrations/S15_004_report_views.sql` (+ `_down`), `sql/assertions/s15_004_report_views.sql`, `lib/accounting/reports.ts`, `services/accounting/reports.ts`, `app/api/accounting/reports/**`, `scripts/verify/step15-reports.ts`. FEATURE_LIST: 3005-3040, 1160-1169.
- 15.4.b Goal: accounting pages (chart, journals, new entry, periods, reports), PDF (`report` kind through the pdf contract) and CSV export.
  Files: `app/(dashboard)/accounting/**`, `components/accounting/**`, `config/{nav,permissions}/s15-*.ts`, `lib/i18n/strings/en/s15-accounting.ts`.
- Done when: balance sheet balances (assets = liabilities + equity) on seeded data; P&L net equals the equity movement; export totals equal the page.

## 15.5 Expenses
- Goal: expense CRUD, categories mapped to accounts, receipt upload (storage contract, file validator), recurring expenses, policy limits and approval (approval contract), reimbursement state, duplicate detection by receipt hash plus amount plus date, event `expense.created`, the OCR connection point as an event handler STEP 16 can feed (no OCR here).
- Files: `migrations/S15_005_expenses.sql` (+ `_down`; `expense_categories`, `expenses`, `receipts`, `expense_policies`, `recurring_expenses`), `sql/assertions/s15_005_expenses.sql`, `lib/accounting/expense-rules.ts`, `services/expense/**`, `app/(dashboard)/expenses/**`, `app/api/expenses/**`, `cron/jobs/s15-recurring-expenses.ts`, `scripts/verify/step15-expenses.ts`.
- FEATURE_LIST: 2931-2959, 1160-1164.
- Done when: the same receipt, amount and date twice is flagged; a policy breach waits for approval; the expense posts once.

## 15.6 Bank reconciliation
- Goal: bank accounts, manual statement import (CSV, OFX, QFX) with a parser per format, imported transactions (also the landing table for STEP 16 feeds), matching rules (amount, date window, reference) and suggestions, reconcile workflow with difference, reconciliation report, unmatched list, adjustments.
- Files: `migrations/S15_006_reconciliation.sql` (+ `_down`; `bank_accounts`, `bank_transactions`, `reconciliations`, `matching_rules`), `sql/assertions/s15_006_reconciliation.sql`, `lib/accounting/{statement-import,matching}.ts`, `services/reconciliation/**`, `app/(dashboard)/accounting/reconciliation/**`, `app/api/accounting/reconciliation/**`, `scripts/verify/step15-reconciliation.ts`.
- FEATURE_LIST: 3041-3053.
- Done when: the three formats parse sample files to the same transactions; a transaction is matched once; a reconciliation finishes only at zero difference.

## 15.7 Assets, budgets, multi-entity, tax reporting, audit pack, forecast and BI (a, b, c)
- 15.7.a Fixed assets and depreciation: register, methods (straight line, declining balance), monthly run posting depreciation, disposal. Files: `migrations/S15_007_assets.sql`, `lib/accounting/depreciation.ts`, `services/asset/**`, `app/(dashboard)/accounting/assets/**`, `cron/jobs/s15-depreciation.ts`, `scripts/verify/step15-assets.ts`. FEATURE_LIST: 3054-3070.
- 15.7.b Budgets and variance, multi-entity and consolidation basics, cash flow forecast, BI views. Files: `migrations/S15_008_budgets_entities.sql`, `lib/accounting/{budget,forecast,consolidation}.ts`, `services/budget/**`, pages and API under `accounting/`, `scripts/verify/step15-budgets.ts`. FEATURE_LIST: 3071-3095, 3134-3154.
- 15.7.c Tax reporting and the audit support pack: tax summaries by jurisdiction, withholding and VAT in and out, filing exports, audit pack (ledger, trail proof, documents). Files: `services/taxfiling/**`, `services/accounting/audit-pack.ts`, `app/api/accounting/{tax,audit-pack}/**`, `scripts/verify/step15-tax.ts`. FEATURE_LIST: 3109-3133, 1165-1169.
- Done when (all three): depreciation totals equal cost less residual at the end of life; budget variance matches ledger sums; consolidation eliminates intercompany; audit pack lists a verified chain.

## 15.8 Payroll (a: people and calculation, b: pay runs and payslips)
- 15.8.a Goal: employees (salary and bank fields encrypted, field-level permission, every view audited), salary structures (components, allowances, deductions), payroll tax settings per company (brackets, rates, caps, social contributions; the platform ships no jurisdiction rates, the owner configures them), calculation as pure functions (gross, tax, deductions, net).
  Files: `migrations/S15_009_payroll_people.sql`, `lib/payroll/{calculate,tax}.ts`, `services/payroll/{employees,structures,tax-settings}.ts`, `app/(dashboard)/payroll/{employees,structures,settings}/**`, `app/api/payroll/**`, `scripts/verify/step15-payroll-calc.ts`. FEATURE_LIST: 2799-2860 (exact lines read at the start).
- 15.8.b Goal: pay runs (draft, calculated, submitted, approved by the chain, paid), duplicate guard (company + employee + period unique in the database), payslip PDF (`lib/pdf/payslip-pdf.tsx`, stored encrypted through the storage contract), payroll journal posting, payment by recorded bank transfer, payroll emails, reports and compliance exports, events `payroll.run_approved|run_paid`.
  Files: `migrations/S15_010_pay_runs.sql`, `services/payroll/{runs,payslips,payments,reports}.ts`, `emails/payroll/**`, `lib/pdf/payslip-pdf.tsx`, `app/(dashboard)/payroll/runs/**`, `scripts/verify/step15-payroll-runs.ts`. FEATURE_LIST: 2861-2913.
- Done when: net pay equals gross minus tax and deductions in the sample cases; a second pay run for the same employee and period is refused (parallel script); the payslip is encrypted at rest.

## 15.9 Employee self-service portal
- Goal: `(client-portal)/p/[token]` for payslips and leave requests through the tokens contract (short expiry, OTP option, one answer for any bad link), noindex, rate limits, every view recorded.
- Files: `app/(client-portal)/p/[token]/**`, `services/payroll/portal.ts`, `app/api/payroll/portal/**`, `emails/payroll/portal-link.tsx`, `scripts/verify/step15-portal.ts`.
- FEATURE_LIST: 2799-2913 (portal items), 2914-2930.
- Done when: a payslip opens only through a valid token; an expired or revoked token gives the same answer as an unknown one.

## 15.10 HR
- Goal: organization structure (departments, positions, reporting lines), onboarding and offboarding checklists, leave types, balances and requests with approval, light performance records.
- Files: `migrations/S15_011_hr.sql` (`departments`, `positions`, `checklists`, `leave_requests`, `leave_balances`, `performance_notes`), `services/hr/**`, `app/(dashboard)/hr/**`, `app/api/hr/**`, `scripts/verify/step15-hr.ts`.
- FEATURE_LIST: 2914-2930.
- Done when: a leave request cannot exceed the balance; approving it updates the balance once.

## Closure
Whole-STEP verification in `VERIFY.md`, `HANDOFF.md` with posting rules table, report list, payroll tax settings and events consumed.
