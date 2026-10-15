# STEP 08 - Clients, Catalog, Inventory and Suppliers

Wave C. Depends on: STEPs 01 to 05 contracts. Contract use: tenant, audit, permissions, locks, storage, events, security. Provides contract: clients.

## Feature sources
- Part 3 lines 1191-1250 (F client CRUD, profile, search, activity, statement data, data management), 1251-1274 (G products and services), 1275-1306 (H stock, warehouses, inventory documents), 1307-1332 (I suppliers, purchase orders, supplier bills and payments), 1502-1516 (O bulk actions: client, product, inventory parts)
- Part 6 lines 2792-2812 (K1 migration wizard is STEP 16; here only the import framework)
- MASTER_PROMPT: client, product duplicate detection; import duplicate detection; concurrent stock update

## Owned paths and migrations
OWNERSHIP_MAP.md rows 08 and section 4. Migration block `S08_*`.

## Sub-steps
- 08.1 Clients: CRUD, soft delete with invoice guard, contacts, billing and shipping addresses (billing postal code and country are required fields for REQ-VERIFY), tags, notes, custom fields, portal preferences, `clients` contract (`getById`, `getBilling`).
- 08.2 Client search and views: server-side search with pg_trgm, filters, saved views, cursor pagination, activity timeline and history, statement data (aging), duplicate detection (name distance and email) with merge flow.
- 08.3 Client data management: export per client, anonymize and delete requests (through compliance), consent flags, communication preferences.
- 08.4 Products and services: CRUD, SKU uniqueness per company, variants, units, tax categories, prices (USD), images via storage contract, duplicate suggestions, search and select component.
- 08.5 Inventory: stock levels, movements, adjustments, transfers, warehouses, low-stock alerts, row-lock updates, inventory documents (receipts, issues), valuation methods, events `stock.low`.
- 08.6 Suppliers and purchasing: suppliers CRUD, purchase orders (draft, approval, receive), supplier bills and payments, three-way match basics, supplier statements.
- 08.7 Import and export framework: CSV and spreadsheet mapping, pre-flight duplicate preview with skip, overwrite or create choices, error report, background job, exports with tenant watermark; used by clients, products, suppliers.
- 08.8 UI: lists with mobile card mode, detail pages, forms with optimistic-lock conflict messages, presence indicator, empty states.

## Security notes
IDOR guard on every id. Imports sanitized, size limited and run in the job queue. Exports audited and rate limited (data exfiltration signal).

## Verification
Concurrent stock deduction never goes negative (parallel script); duplicate client warning appears for near-identical records; merge keeps history; CSV import preview lists duplicates; cross-tenant id returns 404; every page has loading, empty, error and success states.

## Handoff must list
Client contract implementation, events published, permissions registered.
