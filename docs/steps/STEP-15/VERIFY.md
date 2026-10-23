# STEP 15 - Verification

## 15.1 Chart of accounts and journals (2026-10-23)
- `scripts/db-apply.sh --clean`: `S15_001_chart_journals` applies and re-applies cleanly; `sql/assertions/s15_001_chart_journals.sql` passes (RLS on; one account number per company; type and subtype must fit; a parent must have the same type; a system account keeps its code and cannot be removed; an unbalanced entry is refused and leaves nothing behind; a line with both sides and a group account are refused; the first posted entry is `JE-2026-000001`; the same date and lines again is refused with `KD001` and, once confirmed, is linked in `duplicate_of`; a draft is replaced with a version check; posted lines and posted entries cannot be updated or removed; posting twice is a replay; the same source key makes one entry; a reversal links both entries and works once, a reversing entry cannot be reversed; an account with lines keeps its type; the trial balance has debit equal to credit; a draft can be removed; the account history is append only).
- `SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step15-journals.ts` -> 11 checks passed: CSV reading and writing (quotes, byte order mark, formula protection), every industry and country chart is sound and has an account for each mapping key, account input, the tree, QuickBooks and Xero chart files with line numbers for bad rows, chart export, journal input (one side per line, balance, real dates, at most four decimals, draft may be unbalanced), reversing lines, who needs an approval, journal CSV import.
- `npx tsc --noEmit`, `npx eslint` on the new files, `bash scripts/check-all.sh`: clean.
- Not run here (running app needed): the API routes against PostgREST (`/api/accounting/accounts/**`, `/api/accounting/journals/**`), the approval flow for a staff entry, attachments through the storage contract.

## 15.2 Automated posting (2026-10-23)
- `scripts/db-apply.sh --clean`: `S15_002_posting` applies and re-applies cleanly; `sql/assertions/s15_002_posting.sql` passes (RLS on; one log row per event and rule; a posted row needs its entry; a skipped or failed row has none; only a posted row can be reviewed).
- `SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step15-posting.ts` -> 10 checks passed. Case table (event -> lines):

| Event | Lines |
|---|---|
| invoice.sent (total 110, tax 10) | Dr accounts_receivable 110; Cr revenue 100; Cr tax_payable 10 |
| invoice.voided | reverses `invoice:<id>:sent` |
| payment.captured, direct (100) | Dr bank 100; Cr accounts_receivable 100 |
| payment.captured, wallet (gross 100, net 96.5) | Dr wallet_balance 96.5; Dr processor_fees 3.5; Cr accounts_receivable 100 |
| payment.refunded, direct (25) | Dr refunds 25; Cr bank 25 |
| payment.refunded, wallet (25) | Dr refunds 25; Cr wallet_balance 25 |
| payout.paid (amount 200, net 198) | Dr bank 198; Dr processor_fees 2; Cr wallet_balance 200 |
| dispute.lost (100, wallet) | Dr chargeback_expense 100; Cr wallet_balance 100 |
| expense.created unpaid (net 80, tax 8) | Dr default_expense 80; Dr tax_receivable 8; Cr accounts_payable 88 |
| expense.created paid (net 30) | Dr default_expense 30; Cr bank 30 |
| payroll.run_approved (gross 5000, employer 400) | Dr payroll_expense 5000; Dr payroll_tax_expense 400; Cr payroll_liability 5400 |
| payroll.run_paid (net 4200) | Dr payroll_liability 4200; Cr bank 4200 |

  Zero invoices, a missing invoice, a refund without an amount, a dispute without an amount and a plan that does not balance are skipped with a reason; every plan balances (also with four decimals).
- `npx tsc --noEmit`, `npx eslint` on the new files, `bash scripts/check-all.sh`: clean.
- Not run here (running app needed): the handler against real events and the real `settlement_items`, `invoices` and `disputes` tables, the automatic creation of the chart, the review queue API.

## 15.3 Periods (2026-10-23)
- `scripts/db-apply.sh --clean`: `S15_003_periods` applies and re-applies cleanly; `sql/assertions/s15_003_periods.sql` passes (RLS on; a year makes 12 periods, once; February ends on the 28th; an April year ends in March; overlapping years and a year that does not start on the first of a month are refused; posting works in an open period; a month with a draft cannot close; closing twice is a replay; a posting into a closed period is refused with `KD002` and leaves nothing behind; a draft can still be made there; a locked receivables module refuses an invoice entry but not a manual one; the lock date refuses a backdated entry; reopening counts and clears the locks; a closed year refuses a month reopen; closing entries are left out of the period balances; a company without periods is not restricted). `S15_001` assertions still pass with the entry kind.
- `SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step15-periods.ts` -> 6 checks passed: the fiscal year of a date for January, April, July and December years and its label; the closing entry (profit, loss, break even, contra revenue closed by a credit, balance sheet and zero accounts left alone, balanced); recurring dates, catch-up and end date; strict inputs; the checklist rule.
- `npx tsc --noEmit`, `npx eslint` on the new files, `bash scripts/check-all.sh`: clean. The earlier `step15-journals` and `step15-posting` scripts still pass.
- Not run here (running app needed): the period and year API routes, the step-up on reopen, the year-end close against a seeded ledger, the daily recurring job, the next-open-period policy on a real event.

## 15.4.a Statements and reports (2026-10-23)
- `scripts/db-apply.sh --clean`: `S15_004_report_views` applies and re-applies cleanly; `sql/assertions/s15_004_report_views.sql` passes (`is_cash` defaults to false; drafts and closing entries are left out of the balances; closing entries can be included; a date range limits the sums; another company is not mixed in; the monthly function groups by month and leaves closing entries out).
- `SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step15-reports.ts` -> 14 checks passed on one seeded ledger (opening capital 10,000; an invoice of 1,000 plus 100 tax; a payment of 600; rent 300 paid and 200 owed; equipment 2,000; depreciation 100; a loan 500), each both before and after the year-end closing entry:

| Report | Expected |
|---|---|
| Trial balance | debit 11,900 = credit 11,900; the accumulated depreciation shows in the credit column |
| Profit and loss (Q4) | revenue 1,000; operating expenses 600; net income 400; net margin 40.00 percent |
| Balance sheet | assets 11,200; liabilities 800; equity 10,400; balanced; current earnings 400 (0 after closing); fixed assets net of depreciation 1,900 |
| Cash flow | opening cash 10,000; operating 300; investing -2,000; financing 500; net change -1,200; closing 8,800; ties out |
| Cash flow with a dividend booked to retained earnings | financing shows "Other equity movements" -300; still ties out |
| Comparison | revenue 1,000 against 800: change 200, 25.00 percent; a line in one period only is shown |
| Monthly trend | Oct revenue 1,000; Nov expenses 300; Dec 0 |
| Register | running balances 10,100 / 10,700 / 10,400; a contra asset grows with credits |
| Aging at 31 Dec | current 50; 1-30 days 100; 91-120 days 200; over 120 days 400; total 750; a zero amount is left out |
| Cash balances | 8,800 |
| Tax summary | collected 100; paid 0; net payable 100 |
| Ratios | current 31.00; quick 31.00; debt to equity 0.08; working capital 9,000; gross margin 100.00; net margin 40.00; return on equity 3.85; no division by zero |
| Expenses | total 600; rent 83.33 percent, depreciation 16.67 percent; trend by month |

- `npx tsc --noEmit`, `npx eslint` on the new files, `bash scripts/check-all.sh`: clean. The earlier step 15 scripts still pass.
- Not run here (running app needed): the report API routes against PostgREST (the general ledger join, the receivables and payables aging reads of `invoices` and `supplier_bills`).

## 15.4.b Accounting pages and exports (2026-10-23)
- `SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step15-report-tables.ts` -> 9 checks passed: the trial balance table has a totals row and a balanced note; the profit and loss table lists sections, totals and the result (net income 700 on the sample); the balance sheet table has the assets, liabilities and equity blocks and the check note; the cash flow table ends with the cash at the start and the end; the ledger table gives each account an opening and a closing row and says when it was cut; the aging table lists bucket totals; the expense trend table has one column per month; a name that starts with `=` is neutralised in the CSV; the same day one year earlier (29 February becomes 28 February).
- `npx tsc --noEmit`, `npx eslint` on the new files, `bash scripts/check-all.sh` (including the dead-link guard for every page and nav link): clean. The earlier step 15 scripts still pass (journals 11, posting 10, periods 6, reports 14).
- Not run here (running app needed): the pages in a browser (320 px, dark mode, keyboard use), the journal editor against the API, the three export formats (the PDF and Excel builders), the signed link of a file, the step-up prompt on reopen.

## 15.5 Expenses (2026-10-23)
- `scripts/db-apply.sh --clean`: `S15_005_expenses` applies and re-applies cleanly; `sql/assertions/s15_005_expenses.sql` passes (RLS on; a category name is unique under its parent; a category posts to an expense account of the same company; categories nest four levels, not five; the total must equal net plus tax; a rejected expense needs a reason; a paid expense needs its time; a category of another company is refused; an approved expense cannot change its amounts or be removed, but its payment state can change; one expense per recurring item and date; limits above zero; the receipt checksum shape).
- `SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step15-expenses.ts` -> 11 checks passed: strict input (zero, bad amount, markup, a date that does not exist, an employee-paid expense marked paid, payroll as a payment method); limits per expense, day and month count money already spent; the receipt rule (not at the amount, above it); category and role scope and inactive policies; auto-approval only when nothing is breached; what happens to a new expense for owner and staff (clean, auto, flagged, blocked, override with a reason of at least 10 characters); duplicates (same receipt, different receipt, same vendor without receipt, no vendor); decision, policy and recurring inputs; category chain and account; the approved expense becomes the accounting entry (debit 100 to the category account, debit 10 tax receivable, credit 110 accounts payable); the reports (summary by month, category roll-up with children, by employee, deductibility, breaches; pending and rejected expenses are not counted).
- `npx tsc --noEmit`, `npx eslint` on the new files, `bash scripts/check-all.sh`: clean. The earlier step 15 scripts still pass.
- Not run here (running app needed): the API routes and pages, the receipt upload through the storage contract, the approval service for a staff expense, the event `expense.created` reaching the posting worker, `markPaid` against a real ledger, the daily recurring job, the report exports.
