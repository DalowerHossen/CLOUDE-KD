# STEP 15 - Accounting, Expenses, Payroll and HR

Wave C. Depends on: STEP 01 to 05 contracts; consumes domain events from invoices, payments, payouts. Contract use: events, audit, locks, approval, storage, pdf, email, tokens, invoices. Provides contract: accounting (event-fed).

## Feature sources
- Part 8 lines 3327-3742 (A payroll, B HR, C expenses, D chart of accounts and journals, E financial statements, F reconciliation, G fixed assets, H budgets, I standards and multi-entity, J periods, K tax reporting, L audit features, M forecasting and BI)
- Part 3 lines 1415-1426 (L3 expense report, L4 tax report pieces tied to accounting)
- Part 9 lines 4203-4239 (R4 system edge cases: accounting parts)
- MASTER_PROMPT: journal entry, payroll duplicate detection

## Owned paths and migrations
OWNERSHIP_MAP.md rows 15 and section 4. Migration block `S15_*`.

## Sub-steps
- 15.1 Chart of accounts and journals: default chart, account types, journal entries and lines (debit equals credit enforced in the database), manual entry with approval, duplicate detection hash, attachments via storage contract.
- 15.2 Automated posting: consumers of domain events (invoice created, payment captured, refund, payout, expense, payroll) producing balanced journal entries, idempotent by event id.
- 15.3 Periods: fiscal periods, close and lock, adjusting entries, year-end.
- 15.4 Statements and reports: profit and loss, balance sheet, cash flow, trial balance, general ledger, aging, tax summaries, 15+ financial reports, PDF and CSV export.
- 15.5 Expenses: CRUD, receipts upload, categories, recurring expenses, policies and approvals, duplicate detection by receipt hash plus amount plus date; OCR connection point is provided by STEP 16 through the events contract.
- 15.6 Bank reconciliation: manual statement import (CSV, OFX, QFX), matching rules, reconciliation workflow and reports; bank feed connections are STEP 16 and arrive as imported transactions.
- 15.7 Fixed assets, depreciation, budgets and variance, multi-entity and consolidation basics, tax reporting, audit support pack, cash flow forecast, business intelligence views.
- 15.8 Payroll: employees, salary structures, tax calculation, pay runs with approval chain, duplicate guard (company + employee + period), payslip PDF encrypted via storage, payroll journal posting, payroll payments, reports and compliance exports.
- 15.9 Employee self-service portal (`(client-portal)/p/[token]`): payslips and leave requests through tokens contract, OTP option.
- 15.10 HR: organization structure, onboarding and offboarding checklists, leave management, light performance records.

## Security notes
Payroll data classified as highest sensitivity: encrypted fields, field-level access, every view audited. Period close is irreversible without approval and audit entry. Employee portal tokens expire quickly.

## Verification
Trial balance sums to zero after seeded activity; each seeded invoice and payment yields the expected journal lines (case table in `VERIFY.md`); posting a closed-period entry is refused; second pay run for same employee and period refused; payslip opens only through valid token; net pay equals gross minus tax and deductions in the sample cases.

## Handoff must list
Posting rules table, report list, payroll tax settings, events consumed.
