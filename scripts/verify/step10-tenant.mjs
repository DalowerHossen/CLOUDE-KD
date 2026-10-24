// path: scripts/verify/step10-tenant.mjs
// Static check of STEP 10 services: every query on a company table names the company (a foreign id is "not found").
// Platform tables (processors, credentials, modes, tests, routing rules, card identities, blocked cards, webhook events)
// have no company and are listed apart. A call may carry the marker "tenant-ok" with the reason on the same or the
// previous line (for example lookups by a unique processor transaction id that the webhook core needs).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['services/payment'];
const COMPANY_TABLES = new Set([
  'payments',
  'payment_attempts',
  'payment_allocations',
  'refunds',
  'payment_links',
  'payment_reviews',
]);
const PLATFORM_TABLES = new Set([
  'processors',
  'processor_credentials',
  'processor_modes',
  'processor_mode_tests',
  'routing_rules',
  'card_identities',
  'card_blacklist',
  'webhook_events',
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
let platform = 0;
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const text = readFileSync(file, 'utf8');
    const re = /\.from\('([a-z_]+)'\)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (PLATFORM_TABLES.has(m[1])) {
        platform += 1;
        continue;
      }
      if (!COMPANY_TABLES.has(m[1])) continue;
      checked += 1;
      const rest = text.slice(m.index);
      const end = rest.search(/;\s*\n|\n\s*\n/);
      const stmt = rest.slice(0, end < 0 ? 900 : Math.min(end, 1800));
      const line = text.slice(0, m.index).split('\n').length;
      const lines = text.split('\n');
      const marked =
        /tenant-ok/.test(stmt) ||
        /tenant-ok/.test(lines[line - 2] ?? '') ||
        /tenant-ok/.test(lines[line - 1] ?? '');
      const writes = /\.(update|insert|upsert|delete)\(/.test(stmt);
      // An insert names the company in the row it writes.
      const named = /company_id/.test(stmt);
      const keyed = !writes && /\.(in|eq)\('id',/.test(stmt) && marked;
      if (!(named || marked || keyed))
        problems.push(`${file}:${line} query on ${m[1]} has no company_id filter`);
    }
  }
}
if (problems.length > 0) {
  process.stderr.write(
    `${problems.join('\n')}\nFAIL step10-tenant (${problems.length} of ${checked})\n`,
  );
  process.exit(1);
}
process.stdout.write(
  `ok    step10-tenant (${checked} company queries, ${platform} platform queries)\n`,
);
