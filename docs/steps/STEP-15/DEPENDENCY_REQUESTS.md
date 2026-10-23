# STEP 15 - Dependency requests

**R1 Events for the posting rules.** Accounting is fed only by domain events. Please add these to `types/events.ts` and publish them from the owning STEP, so features 2998, 2999 and payout reversals can be posted: `credit_note.issued` and `debit_note.issued` (STEP 09; payload `creditNoteId`, `invoiceId`, `number`, `total`, `taxTotal`, `issueDate`), and `payout.reversed` (STEP 14; payload `payoutId`, `amount`, `net`). Until they exist, those cases are not posted and an owner books them by hand.

**R2 Payload shapes for expense and payroll events.** `expense.created` (STEP 15.5) and `payroll.run_approved|run_paid` (STEP 15.8) are published by this STEP; the shapes are in DECISIONS D4. No change is needed in another STEP.
