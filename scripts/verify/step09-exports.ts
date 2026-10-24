// path: scripts/verify/step09-exports.ts
// Prints "table column" for every table and column STEP 09 registers for tenant exports.
// scripts/verify/step09-exports.sh compares the list with the database.
import '@/services/invoice/tenant-export';
import { tenantExports } from '@/lib/lifecycle/registry';

for (const t of tenantExports())
  for (const c of t.columns) process.stdout.write(`${t.table} ${c}\n`);
