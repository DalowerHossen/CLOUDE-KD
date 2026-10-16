// path: scripts/verify/step08-tenant.mjs
// Static check of STEP 08 services: every database query on a tenant table names the company, so an id of another
// company is "not found". Statements that read only by ids taken from rows that are already company-scoped may carry
// the marker comment "tenant-ok" on the line of the call. A plain read by primary key (display names of rows that a
// company-scoped query already returned) needs no company filter; every write needs one.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = [
  'services/client',
  'services/product',
  'services/inventory',
  'services/supplier',
  'services/purchase',
  'services/import',
  'services/export',
];
const TABLES = new Set([
  'clients',
  'client_contacts',
  'custom_field_defs',
  'saved_views',
  'client_activity',
  'client_merges',
  'client_privacy_requests',
  'product_categories',
  'products',
  'product_variants',
  'product_bundle_items',
  'client_prices',
  'warehouses',
  'stock_levels',
  'stock_movements',
  'stock_cost_layers',
  'inventory_documents',
  'inventory_document_lines',
  'stock_counts',
  'stock_count_lines',
  'suppliers',
  'purchase_orders',
  'purchase_order_lines',
  'supplier_bills',
  'supplier_bill_lines',
  'supplier_remittances',
  'supplier_remittance_allocations',
  'import_jobs',
]);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

const problems = [];
let checked = 0;
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const text = readFileSync(file, 'utf8');
    const re = /\.from\('([a-z_]+)'\)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (!TABLES.has(m[1])) continue;
      checked += 1;
      const rest = text.slice(m.index);
      const end = rest.search(/;\s*\n|\n\s*\n/);
      const stmt = rest.slice(0, end < 0 ? 800 : Math.min(end, 1500));
      const line = text.slice(0, m.index).split('\n').length;
      const writes = /\.(update|insert|upsert|delete)\(/.test(stmt);
      const byKey = /\.(in|eq)\('id',/.test(stmt);
      const ok = /company_id/.test(stmt) || /tenant-ok/.test(stmt) || /tenant-ok/.test(text.split('\n')[line - 2] ?? '') || (!writes && byKey);
      if (!ok) problems.push(`${file}:${line} query on ${m[1]} has no company_id filter`);
    }
  }
}
if (problems.length > 0) {
  process.stderr.write(
    `${problems.join('\n')}\nFAIL step08-tenant (${problems.length} of ${checked})\n`,
  );
  process.exit(1);
}
process.stdout.write(`ok    step08-tenant (${checked} queries checked)\n`);
