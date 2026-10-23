# STEP 08 verification record

Date: 2026-10-16. Branch: claude/clever-goldberg-8ncdae. PostgreSQL 16 (plain, with `supabase/local-shim.sql`).

## A. Automated checks (run in this session)

| Command                                                          | Result                                                                                   |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `PGHOST=/tmp/pgsock PGUSER=postgres bash scripts/integration-check.sh` | ok (section "Integration run" below)                                                                  |
| `bash scripts/db-apply.sh --clean`                               | S01 to S08 migrations applied and re-applied cleanly (S08_001 to S08_010)                |
| `sql/assertions/s08_001` to `s08_010`                            | ok                                                                                       |
| `npx tsx scripts/verify/step08-core.ts`                          | 22 checks ok                                                                             |
| `bash scripts/verify/step08-stock.sh`                            | ok (parallel stock test, below)                                                          |
| `node scripts/verify/step08-tenant.mjs`                          | ok (212 queries on tenant tables carry the company filter or are a read by primary key) |
| `bash scripts/verify/step08-exports.sh`                          | ok (251 registered export columns exist in the database)                                 |
| `node scripts/verify/step04-static.mjs`                          | ok (every API route is wrapped or on the plain-handler list)                             |
| `bash scripts/check-all.sh`                                      | ok                                                                                       |
| `node scripts/check-ownership.mjs 08 HEAD 1257d3b`               | only generated barrels and the shared-file lines named in DEPENDENCY_REQUESTS remain     |

## B. What the checks prove (SCOPE "Verification")

1. Concurrent stock deduction never goes negative: `step08-stock.sh` runs 60 parallel sales of one unit on a stock of 20 (exactly 20 succeed, 40 are refused with `KD001`, the level ends at 0), 80 opposite transfers between two warehouses (no deadlock, the total is unchanged) and 25 requests with one idempotency key (applied once); the append-only ledger adds up to the levels.
2. Duplicate client warning: `kd_client_duplicates` finds the same e-mail, the same tax number and a similar name (typos); creating a look-alike answers `409 duplicate` until the user confirms (`s08_002`, `step08-core`).
3. Merge keeps history: `kd_client_merge` moves contacts, tags and activity, writes a merge record and soft-deletes the source (`s08_002`).
4. CSV import preview lists duplicates: `previewImport` reports rows that match records in the system and rows that repeat inside the file, with the first 50 of each; parsing, mapping, `.xlsx` reading (deflated and stored zip), formula neutralisation and row rules of the three lists are checked in `step08-core`.
5. Cross-tenant id returns 404: every service reads and writes with the company of the session; `step08-tenant.mjs` fails if a query on a tenant table has no company filter; SQL assertions show that the database functions refuse another company's ids (`22023`).
6. Every page has loading, empty, error and success states: loading and unexpected-error screens are the dashboard layout's `loading.tsx` and `error.tsx`; every list page renders `EmptyState` and `ErrorState`; every form shows success, validation, conflict and failure messages.

Database assertions also cover: standard columns and RLS on every table, unique SKU and barcode among live items, negative prices refused, cost layers and FIFO, LIFO and average outflows, batch and expiry, gap-free counters, document posting all-or-nothing, stock count under lock, purchase order receipt in parts and never over the order, three-way match, remittance allocation, idempotency and cancel, import counters.

## C. Manual script (needs a Supabase project and the merged STEPs 02 to 05)

Not run here: no Supabase project. Record the result next to each line.

1. Create a client with a look-alike name: the warning appears; confirm; open the activity timeline. Merge two clients and check the history on the survivor.
2. Edit the same client in two browsers: the second save shows the conflict message; the presence line shows the other person.
3. Add a product with a variant and a volume tier; set a client price; write the price in the picker.
4. Receive 10 units with a batch and expiry; sell 4 (adjust); transfer 3 to a second warehouse; complete a stock count; open `/inventory/valuation`.
5. Create a purchase order as staff: it waits in the approvals list; approve as the owner (cron within 5 minutes); send it; receive in two parts; create a bill from the order; try a bill above the received quantity (it must not post); post with the override as the owner; record a remittance; open the supplier statement and the payables aging.
6. Import a `.csv` and an `.xlsx` of clients with one bad row and one duplicate: check the preview, run, download the error list; export clients and check the watermark line.
7. Bulk archive three products, one of which is in a bundle: two change, one is refused with the reason.

## Integration run

`PGHOST=/tmp/pgsock PGUSER=postgres bash scripts/integration-check.sh`: generators current, lint with zero warnings, typecheck, guards, migrations from zero with all assertions, production build and client bundle secret scan all passed (`integration-check: ok`).

The first run stopped on one lint warning (an unused `eslint-disable` comment in `lib/transfer/mapping.ts`), which was removed. The tenant check found 21 writes without a company filter (all by an id that a company-scoped read had returned); a company filter was added to each, so the database never relies on the earlier read alone.
