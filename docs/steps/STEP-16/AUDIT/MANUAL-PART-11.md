<!-- path: docs/steps/STEP-16/AUDIT/MANUAL-PART-11.md -->
# Manual reading, part 11 (features 991 to 1089, the lines that are Bengali only)

Read against the code and the STEP 08 decisions on 2026-10-27; nothing was opened in a browser. Results: present, partial, not found, not built (recorded by the owner), check in browser. Jobs and workers run only when scheduled (finding 1 in `CONFIRMED_FINDINGS.md`).

| No | Feature | Result | Evidence or note |
|---|---|---|---|
| 991 | Client custom fields per tenant | present | `/api/clients/custom-fields` |
| 995 | Saved views per user and list | present | `/api/clients/views` |
| 998 | Client invoice history | present | `/api/clients/[id]/activity` |
| 999 | Client payment history | present | the same route |
| 1000 | Client estimate history | present | the same route |
| 1001 | Client e-mail log | check in browser | the activity route; the e-mail part was not read |
| 1002 | Client note history | check in browser | |
| 1005 | Client statement e-mail | present | `/api/clients/[id]/statement-mail` |
| 1006 | Client statement date range | present | `/api/clients/[id]/statement` |
| 1007 | Client statement currency | partial | amounts are in USD; display currencies only |
| 1014 | Export column chooser | present | `components/shared/data-table.tsx`, `/api/clients/[id]/export` |
| 1016 | Client credit balance | present | credit notes and credits (`components/credit`) |
| 1017 | Client credit limit | present | `creditLimit` in `lib/crm/clients.ts` |
| 1023 | Product or service create, edit, delete, archive | present | `/api/products`, `/api/products/[id]/status` |
| 1024 | Product name and description | present | `/api/products` |
| 1027 | Product default tax rate | present | tax code on the product (`components/inventory/product-form.tsx`) |
| 1029 | Product category | present | `/api/products/categories` |
| 1031 | Product active or inactive toggle | present | `/api/products/[id]/status` |
| 1032 | Product custom fields | present | `components/inventory/product-form.tsx` |
| 1033 | Product search dropdown on an invoice line | present | `/api/products/picker` |
| 1035 | Product fuzzy search | present | `services/product/search.ts` (trigram) |
| 1036 | Inline new item from the invoice form | check in browser | |
| 1038 | Product bulk export | present | `/api/products/bulk`, `/api/export` |
| 1039 | Duplicate product detection | present | `/api/products/duplicates` (STEP 08 D30) |
| 1045 | Stock decreases when an invoice is sent | present | worker `inventory.invoice-stock` (STEP 08 D15); needs `worker-tick` scheduled |
| 1048 | Out-of-stock alert | partial | STEP 08: no low-stock event; the reorder list shows it (`/api/inventory/reorder`) |
| 1053 | Inventory valuation report | present | `/api/inventory/valuation` |
| 1055 | Batch and lot tracking | present | lots in `migrations/S08_006_valuation.sql` and `S08_008_suppliers_orders.sql` |
| 1056 | Expiry date tracking | present | `/api/inventory/expiring`, job `stock-expiry` |
| 1057 | Multi-warehouse support | present | `/api/inventory/warehouses` |
| 1058 | Warehouse create, edit, delete | present | the same route |
| 1059 | Warehouse address | present | the same route |
| 1061 | Stock report per warehouse | present | `/api/inventory/levels` |
| 1062 | Default warehouse per tenant | present | `services/inventory/stock.ts` |
| 1063 | Packing slip | present | `lib/stock/documents.ts` (print layout; STEP 08: no PDF) |
| 1064 | Delivery note | present | the same |
| 1065 | Stock count | present | `/api/inventory/counts` |
| 1067 | Purchase return | not found | |
| 1070 | Supplier create, edit, delete, archive | present | `/api/suppliers` |
| 1072 | Supplier payment terms | check in browser | |
| 1073 | Supplier category | check in browser | |
| 1074 | Supplier statement | present | `/api/suppliers/[id]/statement` |
| 1075 | Supplier payment record | present | `/api/remittances` |
| 1077 | Purchase order create, edit, delete | present | `/api/purchase-orders` |
| 1081 | Purchase order approval workflow | present | approval contract, job `po-approvals` |
| 1085 | Purchase order to supplier bill matching | partial | `/api/purchase-orders/[id]/bill-draft` makes a bill draft; no matching of quantities and prices |
| 1087 | Supplier bill to accounting journal | not built | STEP 08 left bills to STEP 15; STEP 15 posts invoices, payments, refunds, disputes, expenses and pay runs, not supplier bills |
| 1089 | Supplier payment record | present | `/api/remittances` |

## Not built or not found: 1067, 1087. Partly built: 1007, 1048, 1085.
