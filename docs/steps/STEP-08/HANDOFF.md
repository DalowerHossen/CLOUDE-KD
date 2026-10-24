# STEP 08 handoff - Clients, Catalog, Inventory and Suppliers

Branch: claude/clever-goldberg-8ncdae (contains STEP 01 to 08).

## FEATURE_LIST items implemented (line ranges of SCOPE.md)

- Part 3 1191-1250 (F clients): create, edit, archive, reactivate, soft delete with guard, contacts, billing and shipping addresses (billing postal code and country required), tags, notes, custom fields, risk flag, credit limit, opening balance, consent and contact preferences, portal preferences; trigram search with filters and cursor pages, saved views, activity timeline, duplicate warning and merge that keeps history, statement data with aging, statement by e-mail, per-client data export, anonymize and delete with approval, bulk edit.
- Part 3 1251-1274 (G products and services): products, services and bundles, SKU and barcode unique per company, variants, units, tax categories and rates, volume tiers, client-specific prices, categories, up to five pictures, duplicate warning, picker for invoice lines.
- Part 3 1275-1306 (H stock): warehouses, stock levels, append-only ledger, adjustments with reasons, transfers, reorder levels and low-stock notices, FIFO, LIFO and average cost, cost of goods sold, batches and expiry, goods received, goods issued, sales return, purchase return, packing slip, delivery note, stock counts, barcode lookup and scan page.
- Part 3 1307-1332 (I suppliers): supplier list and record, purchase orders with approval, sending by e-mail and receiving in parts, supplier bills with three-way match, remittances (money paid to suppliers), payables aging, supplier statement.
- Part 3 1502-1516 (O bulk actions): clients, products, suppliers.
- Import and export of spreadsheets (SCOPE 08.7): `.csv` and `.xlsx` for clients, products and suppliers, mapping, preview, duplicate choices, background run, error report, watermarked exports.
- Not built, with reasons (DECISIONS): PDF output of statements, orders and documents (print layouts instead; the `pdf` contract belongs to STEP 09, DEPENDENCY_REQUESTS); accounting entries for bills and remittances (STEP 15); a domain event for low stock (not in the fixed event list); importing bundles (they need item lists); partial overwrite of custom fields in imports.

## Migrations (S08_001 to S08_010, each with a `_down` file and an assertion in `sql/assertions/`)

| File                         | Content                                                                                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| S08_001_clients              | `clients`, `client_contacts`, `custom_field_defs`; `kd_client_contacts_replace`                                                           |
| S08_002_client_search        | balance columns, `saved_views`, `client_activity`, `client_merges`; `kd_client_search`, `kd_client_duplicates`, `kd_client_merge`, `kd_client_set_balances` |
| S08_003_client_privacy       | consent columns, `client_privacy_requests`; `kd_client_anonymize`                                                                         |
| S08_004_products             | `product_categories`, `products`, `product_variants`, `product_bundle_items`, `client_prices`; `kd_product_search`, `kd_product_duplicates`, `kd_bundle_items_replace` |
| S08_005_inventory            | `warehouses`, `stock_levels`, `stock_movements`; `kd_stock_move`, `kd_stock_transfer`, `kd_stock_move_many`                               |
| S08_006_valuation            | cost layers, layer uses, `number_counters`; `kd_next_number`, `kd_stock_apply`, `kd_stock_valuation`                                      |
| S08_007_inventory_documents  | `inventory_documents`, lines, `stock_counts`, lines; `kd_inventory_document_post`, `kd_stock_count_start`, `kd_stock_count_complete`      |
| S08_008_suppliers_orders     | `suppliers`, `purchase_orders`, `purchase_order_lines`; `kd_supplier_search`, `kd_po_receive`                                              |
| S08_009_supplier_bills       | `supplier_bills`, lines, `supplier_remittances`, allocations; `kd_bill_post`, `kd_supplier_remit`, `kd_supplier_remit_void`               |
| S08_010_import_jobs          | `import_jobs`                                                                                                                             |

All tables have the standard columns (`version` included), RLS with default deny, the audit trigger, and are closed to `authenticated`; all functions are `security definer` and granted to `service_role` only.

## Contract provided, events, permissions

- Contract `clients` (`getById`, `getBilling`), registered in `services/client/register.ts`.
- Domain events published: `client.created`, `client.updated`. Event consumed: `invoice.sent`, `invoice.voided` (worker `inventory.invoice-stock`, payload needs `invoiceId` and `lines`, see DEPENDENCY_REQUESTS).
- Notification types: `stock.low`, `stock.out`, `stock.short`, `stock.expiring`, `import.finished`.
- Approval rules: `client.anonymize` (L1), `po.approve` (L1).
- Cron jobs: `client-privacy` (5 minutes), `stock-expiry` (daily 06:10), `po-approvals` (5 minutes). Job handler: `transfer.import`.
- Permissions (`config/permissions/s08-*.ts`): `client.{read,create,update,archive,delete,merge,export,privacy,bulk,email}`, `catalog.fields`, `product.{read,create,update,archive,delete,client_rates,bulk}`, `inventory.{read,adjust,transfer,warehouses,costs,documents,count}`, `supplier.{read,write,delete,bulk}`, `po.{read,write,send,receive}`, `bill.{read,write,override}`, `remittance.write`, `import.manage`, `list.export`.
- E-mail templates: `invoice.client-statement`, `invoice.purchase-order`. No new environment variables.
- Tenant exports registered for 19 tables (`services/client/tenant-export.ts`).

## Pages and APIs

Pages: `/clients` (+`new`, `<id>`, `<id>/statement`, `duplicates`, `merge`), `/products` (+`new`, `<id>`, `categories`), `/inventory` (+`movements`, `warehouses`, `valuation`, `documents`(+`new`, `<id>`), `counts`(+`<id>`), `scan`), `/suppliers` (+`new`, `<id>`, `<id>/statement`), `/purchase-orders` (+`new`, `<id>`), `/bills` (+`new`, `<id>`, `aging`), `/imports` (+`<id>`).

APIs: `/api/clients/*` (15 routes), `/api/products/*` (11), `/api/inventory/*` (15), `/api/suppliers/*` (5 + statement), `/api/purchase-orders/*` (3 + bill-draft), `/api/bills/*`, `/api/remittances/*`, `/api/import/*`, `/api/export`. Every route is wrapped by `withApi` except the picture download `GET /api/products/<id>/images/<file>` (plain handler, on the allow list).

## Reading data from other STEPs

Price for a client and quantity: `priceFor` in `services/product/client-rates.ts`. Items for invoice lines: `GET /api/products/picker`. Stock of an item: `productStock` in `services/inventory/stock.ts`. Stock changes from other code: `moveLines` in `services/inventory/stock.ts` (never write the stock tables directly).

## Owner steps (outside the code)

1. Nothing to configure: the default warehouse is created on first use.
2. Decide the cost method per product (average cost is the default) before the first receipts; it can be changed later but applies to new movements.
3. Give staff the permissions they need (clients, products, stock, suppliers); exports (`list.export`) are owner-only by default.
