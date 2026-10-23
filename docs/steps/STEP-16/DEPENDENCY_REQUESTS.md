# STEP 16 - Dependency requests

**R1 Write operations for clients, invoices, products and estimates.** The `clients` and `invoices` contracts only read (`getById`, `getBilling`, `getForPayment`, `applyPayment`, `markDisputed`, `snapshot`). The public API, the e-commerce order sync and the migration wizard must create and update records through the owning services. Please add to `types/contracts/`: `clients.create|update|findByEmail`, `invoices.createDraft|getById|createPaymentLink`, `products.create|update|findBySku` and `estimates.getById` (all with a company id from the tenant context, optimistic version, an idempotency key, and the same audit and event behaviour as the STEP 08 and 09 services). Until then STEP 16 offers only read endpoints and stops the write parts with `BLOCKERS.md`.

**R2 OCR and bank feed hand-over.** STEP 15 asked that STEP 16 call `applyOcrResult` (`services/expense/receipts.ts`) and `importFeedBatch` (`services/reconciliation/transactions.ts`) directly. They are the only direct cross-STEP calls of STEP 16 and sit behind `services/ocr/ports.ts` and `services/bankfeed/ports.ts`. If the Integrator prefers events (`receipt.ocr_completed`, `bank_feed.batch_imported`), add the names to `types/events.ts`; the ports are the only files that change.

**R3 Packages.** None is required to start (REST through `fetch`). If the owner wants the official Plaid or Google Vision clients, a QR image library or an SDK build, they are requested here before use.

**R4 Cron file names.** This STEP names cron files `cron/jobs/s16-*.ts` like the earlier STEPs; SCOPE.md says `16-*`. Confirm that `s16-*` is right for `scripts/gen.mjs`.
