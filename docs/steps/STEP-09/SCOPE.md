# STEP 09 - Invoicing Core, PDF, Projects and Reports

Wave C. Depends on: STEPs 01 to 05 contracts; consumes `clients` (STEP 08) through its contract. Provides contracts: invoices, pdf, fx.

## Feature sources
- Part 3 lines 955-1190 (A invoices CRUD, items, calculation, numbering, status, metadata; B US layout, templates, branding auto-fill; C PDF; D estimates, credit and debit notes, proforma, deposit, recurring, installments; E projects, time tracking, billable hours), 1363-1453 (K dashboard, L reports), 1454-1501 (M reminders, late fees, other billing, N tax), 1502-1516 (O batch invoices and bulk actions)
- Part 5 lines 2245-2272 (G1-G2 invoice integrity and approval workflow data side)
- Part 9 lines 4140-4180 (P Asia tax and localization: tax parts), 4203-4239 (R1 invoice edge cases)
- MASTER_PROMPT: invoice numbering, duplicate detection, "American-style Amazon-acceptable invoice"

## Owned paths and migrations
OWNERSHIP_MAP.md rows 09 and section 4. Migration block `S09_*`.

## Sub-steps
- 09.1 Money and calculation engine: line totals, discounts, taxes (inclusive and exclusive), shipping, rounding rules, all through `Money`; tax rates and tax engine; display-currency conversion with rates frozen on the invoice (`fx` contract, `fx_rates` table and rate provider).
- 09.2 Invoice model and CRUD: schema with `duplicate_hash`, version, status machine (draft, pending approval, sent, viewed, partially paid, paid, overdue, void, disputed), line items, notes, terms, attachments via storage contract.
- 09.3 Numbering: gapless per company sequence under advisory lock, format settings from STEP 07, void handling, uniqueness assertions.
- 09.4 Staff-draft to owner-send workflow through the approval contract, duplicate detection ("similar invoice exists"), conflict UI.
- 09.5 PDF engine and layouts: `lib/pdf/pdf-engine.ts`, US invoice layout, templates, branding auto-fill, snapshot on send (immutable PDF plus JSON), no tracking pixels, `pdf` contract, estimate and report PDFs.
- 09.6 `invoices` contract: `getForPayment` (amount due, billing postal code and country snapshot from the client, status, version), `applyPayment`, `markDisputed`, `snapshot`; domain events `invoice.*`.
- 09.7 Estimates: create, send, convert to invoice, expiry; credit notes, debit notes, proforma, deposits and advances.
- 09.8 Recurring invoices, installment plans, payment reminders and late fees (schedules and rules; sending through email contract; cron job handlers in `cron/jobs/09-*`).
- 09.9 Projects and time: projects, tasks, timers, time entries, billable batches to invoice lines.
- 09.10 Dashboard home and reports: revenue overview, sent versus paid, aging, charts (Recharts, mobile-optimized), sales, tax, client, inventory and project reports, export (CSV, PDF), saved report settings.
- 09.11 Batch invoicing and bulk actions with batch-id duplicate guard; Asia tax localization settings (display only); edge cases (zero-amount, rounding, back-dated, void after partial payment).

## Security notes
Snapshots are immutable (policy blocks update). Invoice ids and tokens never in logs. Report endpoints rate limited and audited.

## Verification
Hand-calculated case table in `VERIFY.md` (includes 0.1 + 0.2, inclusive tax, discount order) matches; 100 parallel creations yield sequential numbers with no gap (script); sent invoice cannot be edited; PDF opens with all fields; duplicate warning shown; estimate converts with totals preserved.

## Handoff must list
Contracts implemented, events, cron jobs, report catalogue.
