# STEP 09 verification record

Date: 2026-10-17. Branch: claude/clever-goldberg-8ncdae. PostgreSQL 16 (plain, with `supabase/local-shim.sql`).

## A. Automated checks (run in this session)

| Command                                                                 | Result                                                                                          |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `PGHOST=/tmp/pgsock PGUSER=postgres bash scripts/db-apply.sh --clean`    | S01 to S09 migrations applied and re-applied cleanly (S09_001 to S09_017); 17 STEP 09 assertions ok |
| `sql/assertions/s09_001` to `s09_017`                                    | ok                                                                                              |
| `npx tsx scripts/verify/step09-calc.ts`                                  | 17 checks ok (hand-calculated table below + 2000 generated invoices)                            |
| `npx tsx scripts/verify/step09-core.ts`                                  | 30 checks ok                                                                                    |
| `npx tsx scripts/verify/step09-pdf.mts`                                  | 14 checks ok (4 looks x 2 paper sizes, 120 lines on several pages, watermarks, report PDF)      |
| `bash scripts/verify/step09-numbering.sh`                                | ok (100 parallel invoices get 1 to 100, no gap; rolled-back number is reused)                   |
| `bash scripts/verify/step09-recurring.sh`                                | ok (20 workers claim one occurrence once; credit applications cannot exceed the credit; 60 batch items claimed once each) |
| `bash scripts/verify/step09-exports.sh`                                  | ok (272 registered export columns exist in the database)                                        |
| `node scripts/verify/step09-tenant.mjs`                                  | ok (179 queries on tenant tables carry the company filter or are a read by primary key)         |
| `node scripts/verify/step04-static.mjs`                                  | ok (every API route is wrapped by `withApi` or on the plain-handler list)                       |
| `bash scripts/check-all.sh`                                              | ok                                                                                              |
| `npx tsc --noEmit`, `npx eslint . --max-warnings 0`                      | ok, zero warnings                                                                               |
| `SKIP_ENV_VALIDATION=1 npm run build` and `bash scripts/check-bundle-secrets.sh` | ok                                                                                      |
| `node scripts/check-ownership.mjs 09 HEAD e161045`                       | only generated files and the shared-file lines named in DEPENDENCY_REQUESTS remain              |

## B. Hand-calculated cases (SCOPE "Verification")

All amounts in US dollars, four decimals in the database. `calculate()` in `lib/invoice/calc.ts`; each row is an assertion in `scripts/verify/step09-calc.ts`.

| #  | Case                                                                 | Hand calculation                                                              | Result checked                              |
| -- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------- |
| 1  | 0.1 + 0.2                                                            | exactly 0.3 (decimal arithmetic, no binary float)                             | subtotal and total `0.3000`                 |
| 2  | 100, 10% discount before tax, 10% tax                                | net 90, tax 9, total 99                                                       | `90.0000`, `9.0000`, `99.0000`              |
| 3  | Same, discount after tax                                             | tax on 100 is 10, discount 10, total 100                                      | tax `10.0000`, total `100.0000`             |
| 4  | Inclusive price 110, 10% tax                                         | net 100, tax 10, total 110                                                    | `100.0000`, `10.0000`, `110.0000`           |
| 5  | Inclusive price 100, taxes 7.25% + 2%                                | net + tax = 100 exactly (multiplier 1.0925)                                   | total `100.0000`                            |
| 6  | Compound tax 5% then 10% on 100                                      | 5.00, then 10% of 105 = 10.50, total 115.50 (multiplier 1.155)                | `5.0000`, `10.5000`, `115.5000`             |
| 7  | Three lines of 1.005, rounding per line / on total / banker's        | per line 1.01 x 3 = 3.03; on total 3.015 -> 3.02; banker's 1.00 x 3 = 3.00    | `3.0300`, `3.0200` (difference `0.0100`), `3.0000` |
| 8  | Document discount 10 over 33.33 + 33.33 + 33.34                      | shares add up to exactly 10; total 90                                          | shares sum `10.0000`, total `90.0000`       |
| 9  | 200 with 10% tax, 25% document discount                              | discount 50, net 150, tax 15, total 165                                       | `50.0000`, `15.0000`, `165.0000`            |
| 10 | 100 plus shipping 20, not taxable / taxable at 10%                   | 120 / shipping tax 2, total 122                                               | `120.0000`, `122.0000`                      |
| 11 | 1000 with 10% tax, withholding 5%                                    | total 1100, withheld 50, due 1050                                             | `1100.0000`, `50.0000`, `1050.0000`         |
| 12 | Cash rounding 0.05 on 10.03 and 10.02; to 1 on 10.4                  | +0.02 -> 10.05; -0.02 -> 10.00; 10.00                                          | `0.0200`, `-0.0200`, `10.0000`              |
| 13 | Estimate with 3 x 99.99 and 1.5 x 10.10 less 10%, 10% tax            | lines 299.97 and 13.63 (discount 1.515 -> 1.52), tax 30.00 + 1.36, total 344.96 | same totals before and after converting     |
| 14 | Credit note: invoice 4 x 10 (10% tax) + 100 untaxed, credit 1 unit   | 10 + 1 tax = 11; whole invoice 144; rest after 1 unit: 30 + 3 + 100 = 133      | `11.0000`, `144.0000`, `133.0000`           |
| 15 | Recurring on the 31st                                                | Jan 31, Feb 28, Mar 31, Apr 30, May 31; leap year Feb 29                      | dates equal                                 |
| 16 | Installments 100 in 3 parts / 1000 with 25% down in 4                | 33.3333 + 33.3333 + 33.3334; 250 x 4                                          | parts add up to the total exactly           |
| 17 | Reports: sales, tax, aging, client revenue, items, time              | worked in `step09-core.ts` comments (for example net sales 1840.50, tax 150 - 10 = 140) | equal                                |

## C. What the checks prove (SCOPE "Verification")

1. Hand-calculated table including 0.1 + 0.2, inclusive tax and discount order matches (section B).
2. 100 parallel creations give sequential numbers with no gap: `step09-numbering.sh` numbers 100 invoices in 100 parallel sessions (1 to 100, no gap, no repeat) and 20 debit notes in parallel (1 to 20); a number taken in a rolled-back transaction is handed out again.
3. A sent invoice cannot be edited: the database trigger `kd_invoice_guard` refuses a change of any field except the allowed ones (status, payments, notes for the owner and similar); `s09_002` shows the refusals. The same holds for sent estimates, issued credit notes, submitted time entries, decided estimates and snapshots.
4. PDF opens with all fields: `step09-pdf.mts` draws the invoice in all four looks and both paper sizes, with watermark, 120 lines over several pages, and checks the file starts with `%PDF-`; the stored snapshot of a sent invoice is immutable (`s09_006`).
5. Duplicate warning: sending an invoice with the same client, type, total and issue date as another answers `409` with the similar invoices until the person confirms (`findSimilarInvoices`, `s09_002` for the hash).
6. Estimate converts with totals preserved: check 13 above (same calculation before and after the conversion; if a tax rate changed in between, the screen says the total is different).
7. Concurrency: only one worker can claim a recurring occurrence, a credit or deposit cannot be applied above what is left, and a batch item is taken by one worker only (`step09-recurring.sh`).
8. Cross-tenant ids: every service reads and writes with the company of the session; `step09-tenant.mjs` fails if a query on a tenant table has no company filter; database functions refuse another company's ids (`22023`).

## D. Manual script (needs a Supabase project, the merged STEPs 02 to 08 and a mail account)

Not run here: no Supabase project and no mail server. Record the result next to each line.

1. Set tax rates and the seller bank details (Tax and rates). Write an invoice for a client, add lines with an exclusive and an inclusive tax, a document discount and shipping. The totals shown while typing must equal the saved totals.
2. Send the invoice as the owner: it gets a number, the client receives the link, the PDF button opens the stored PDF. As staff: the invoice waits; approve as the owner; within 5 minutes it is sent.
3. Write the same invoice twice: the second send warns about the similar invoice.
4. Void a partly paid invoice: the checkbox about refunding or crediting must be ticked first.
5. Credit note for part of an invoice: it is applied to the invoice; apply what is left to another invoice of the same client. Ask for a deposit, pay it (STEP 10), apply it to the final invoice.
6. Make a recurring schedule from an invoice, "Make the next invoice now"; set it to send by itself (owner only).
7. Split an invoice in installments and pay the first part: the first part shows as paid; move the date back and see the invoice become overdue after the hourly job.
8. Turn on reminders and late fees; check a reminder arrives only outside quiet hours; record a promise to pay and see reminders stop until its date; apply and waive a fee; write off a balance.
9. Make a project, add a member with a rate, track time with the timer, submit, approve as the owner, bill the project: the invoice draft has the lines; void the draft and see the time return.
10. Open the dashboard, change the period, hide and move a widget, reload; use the search box.
11. Run each report, compare with the period before, download CSV, Excel (open it in a spreadsheet) and PDF; save a preset; schedule a report and check the e-mail link.
12. Select five invoices and send them in a batch; watch the progress; stop a batch; retry failed items; create invoices for three clients from one invoice.

## E. Integration run

`bash scripts/integration-check.sh`: generators current, lint with zero warnings, typecheck, guards, migrations from zero with all assertions, production build and client bundle secret scan all passed.

Problems found and fixed while building: money-named paths cannot use `Number`, `parseInt`, `Math.round` and similar (helpers in `lib/reports/numbers.ts`); Prettier turns `\u` escapes in source into raw characters (non-ASCII text is refused by the English-only guard), so such characters are built with `String.fromCharCode` or regular-expression strings; the tenant check found writes without a company filter, which were fixed; the discount rounding rule (round each part of a line separately) was written into the hand-calculated table after the estimate check showed 13.63, not 13.635.
