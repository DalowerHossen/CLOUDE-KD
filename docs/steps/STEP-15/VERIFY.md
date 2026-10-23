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
