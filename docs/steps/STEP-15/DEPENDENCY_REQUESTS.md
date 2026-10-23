# STEP 15 - Dependency requests

**R1 Events for the posting rules.** Accounting is fed only by domain events. Please add these to `types/events.ts` and publish them from the owning STEP, so features 2998, 2999 and payout reversals can be posted: `credit_note.issued` and `debit_note.issued` (STEP 09; payload `creditNoteId`, `invoiceId`, `number`, `total`, `taxTotal`, `issueDate`), and `payout.reversed` (STEP 14; payload `payoutId`, `amount`, `net`). Until they exist, those cases are not posted and an owner books them by hand.

**R2 Payload shapes for expense and payroll events.** `expense.created` (STEP 15.5) and `payroll.run_approved|run_paid` (STEP 15.8) are published by this STEP; the shapes are in DECISIONS D4. No change is needed in another STEP.

**R3 Approval of an action by a person outside the company.** The approval contract decides a request only for the deciding person's own company, so an action that must wait for a platform role (for example reopening a closed accounting period) cannot be resumed after the decision. STEP 15 uses a fresh identity check, a reason and an audit entry instead. If the Integrator wants a platform approval for it, the approval service needs a callback to the requesting service when a request is decided.

**R4 Dimensions on journal lines.** Features 3008 and 3009 (profit and loss by department, cost centre and project) need a department or project on each journal line. Please say which STEP owns departments and cost centres (STEP 15.10 HR has departments; projects are STEP 09). Until a decision, the reports have no such split.

**R5 Scheduled accounting reports.** The report schedule of STEP 09 (`services/report/schedules.ts`) runs only the report definitions of STEP 09. To e-mail a profit and loss every month (feature 3013), please let a schedule point at a report from a registry, so STEP 15 can register its reports (`reportTable(companyId, key, query)` in `services/accounting/report-export.ts` returns the table the schedule needs).

**R6 OCR for receipts.** Please let the OCR service (STEP 16) call `applyOcrResult(companyId, receiptId, { vendor, date, total, tax })` from `services/expense/receipts.ts` when it has read a receipt (or with `null` when it failed). The contract list has no OCR event, so this is a direct call; if the Integrator prefers an event, add `receipt.ocr_completed` to `types/events.ts` and STEP 15 will consume it. A new receipt is stored with `ocr_status = pending` so the OCR service can find it.
