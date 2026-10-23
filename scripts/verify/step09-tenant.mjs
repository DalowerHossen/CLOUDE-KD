// path: scripts/verify/step09-tenant.mjs
// Static check of STEP 09 services: every database query on a tenant table names the company, so an id of another
// company is "not found". Statements that read only by ids taken from rows that are already company-scoped may carry
// the marker comment "tenant-ok" on the line of the call. A plain read by primary key (display names of rows that a
// company-scoped query already returned) needs no company filter; every write needs one.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = [
  'services/invoice',
  'services/estimate',
  'services/credit',
  'services/project',
  'services/tax',
  'services/fx',
  'services/report',
];
const TABLES = new Set([
  'tax_rates',
  'tax_settings',
  'client_tax_exemptions',
  'fx_rates',
  'invoices',
  'invoice_items',
  'invoice_revisions',
  'invoice_sequences',
  'invoice_snapshots',
  'invoice_events',
  'invoice_payment_links',
  'estimates',
  'estimate_items',
  'credit_notes',
  'recurring_schedules',
  'installment_plans',
  'late_fee_rules',
  'reminder_rules',
  'reminder_log',
  'projects',
  'project_tasks',
  'project_milestones',
  'time_entries',
  'timesheets',
  'dashboard_layouts',
  'report_presets',
  'report_schedules',
  'invoice_batches',
  'invoice_batch_items',
]);

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
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
      const ok =
        /company_id/.test(stmt) ||
        /tenant-ok/.test(stmt) ||
        /tenant-ok/.test(text.split('\n')[line - 2] ?? '') ||
        (!writes && byKey);
      if (!ok) problems.push(`${file}:${line} query on ${m[1]} has no company_id filter`);
    }
  }
}
if (problems.length > 0) {
  process.stderr.write(
    `${problems.join('\n')}\nFAIL step09-tenant (${problems.length} of ${checked})\n`,
  );
  process.exit(1);
}
process.stdout.write(`ok    step09-tenant (${checked} queries checked)\n`);
