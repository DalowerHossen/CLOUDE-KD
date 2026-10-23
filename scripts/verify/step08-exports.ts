// path: scripts/verify/step08-exports.ts
// Prints "table column" for every table and column STEP 08 registers for tenant exports.
// scripts/verify/step08-exports.sh compares the list with the database.
import '@/services/client/tenant-export';
import { tenantExports } from '@/lib/lifecycle/registry';

const mine = new Set([
  'clients',
  'client_contacts',
  'product_categories',
  'products',
  'product_variants',
  'product_bundle_items',
  'client_prices',
  'warehouses',
  'stock_levels',
  'stock_movements',
  'inventory_documents',
  'inventory_document_lines',
  'suppliers',
  'purchase_orders',
  'purchase_order_lines',
  'supplier_bills',
  'supplier_bill_lines',
  'supplier_remittances',
  'supplier_remittance_allocations',
]);
for (const t of tenantExports())
  if (mine.has(t.table)) for (const c of t.columns) process.stdout.write(`${t.table} ${c}\n`);
