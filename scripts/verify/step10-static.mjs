// path: scripts/verify/step10-static.mjs
// Static rules of STEP 10 that no compiler checks:
//  1. money columns of the S10 migrations are numeric(18,4);
//  2. no plaintext secret column on processor_credentials;
//  3. no failover to another processor anywhere in the payment code;
//  4. secrets, tokens and credentials are not passed to the logger;
//  5. the single-use payment token is never written to the database;
//  6. every write route of the processors admin API demands a fresh identity check (step-up);
//  7. the processor webhook route helper verifies before it parses (order of calls in the core).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir, ext) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, ext));
    else if (ext.some((e) => p.endsWith(e))) out.push(p);
  }
  return out;
}
const problems = [];
const fail = (file, message) => problems.push(`${file}: ${message}`);

// 1 and 2
for (const file of readdirSync('migrations').filter(
  (n) => /^S10_.*\.sql$/.test(n) && !n.endsWith('_down.sql'),
)) {
  const text = readFileSync(join('migrations', file), 'utf8');
  for (const m of text.matchAll(/numeric\(([^)]*)\)/g)) {
    if (m[1].replace(/\s/g, '') !== '18,4')
      fail(file, `money type numeric(${m[1]}) must be numeric(18,4)`);
  }
  for (const m of text.matchAll(
    /^\s+([a-z_]*(amount|total|fee)[a-z_]*)\s+(numeric|decimal|real|double|float|integer|int|bigint)\b(?!\()/gim,
  )) {
    fail(file, `column ${m[1]} must be numeric(18,4), found ${m[3]}`);
  }
  if (
    /create table[^;]*processor_credentials[^;]*\b(secret|api_key|password|plaintext|token)\s+text/is.test(
      text,
    )
  ) {
    fail(file, 'processor_credentials has a plaintext secret column');
  }
}

const codeFiles = [
  ...walk('lib/payment', ['.ts']),
  ...walk('services/payment', ['.ts']),
  ...walk('app/api/payments', ['.ts']),
  ...walk('app/api/payment-links', ['.ts']),
  ...walk('app/api/refunds', ['.ts']),
  ...walk('app/api/admin/processors', ['.ts']),
  ...walk('components/payment', ['.ts', '.tsx']),
];
for (const file of codeFiles) {
  const text = readFileSync(file, 'utf8');
  const code = text
    .split('\n')
    .filter(
      (l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'),
    )
    .join('\n');
  // 3
  if (
    /failover|fallbackProcessor|fallback_processor|nextProcessor|tryAnotherProcessor|retryWithAnother/i.test(
      code,
    )
  ) {
    fail(file, 'failover to another processor is not allowed (REQ-ADMIN-CONNECT item 7)');
  }
  // 4
  for (const m of code.matchAll(/logger\.(info|warn|error|debug)\(([\s\S]*?)\);/g)) {
    if (/\b(credentials|secretKey|secret|paymentToken|password|apiKey)\b/.test(m[2])) {
      fail(file, `logger call may carry a secret: ${m[0].slice(0, 80).replace(/\n/g, ' ')}`);
    }
  }
  // 5
  for (const m of code.matchAll(/\.(insert|upsert|update)\(([\s\S]*?)\)\s*(\.|;)/g)) {
    if (/paymentToken|payment_token/.test(m[2]))
      fail(file, 'the single-use payment token must not be written to the database');
  }
}

// 6
for (const file of walk('app/api/admin/processors', ['route.ts'])) {
  const text = readFileSync(file, 'utf8');
  const exportsWrite = [
    ...text.matchAll(
      /export const (POST|PUT|PATCH|DELETE) = withApi\(\s*\{([\s\S]*?)\n\s*\},\s*\n\s*async/g,
    ),
  ];
  for (const m of exportsWrite) {
    if (!/stepUp:/.test(m[2])) fail(file, `${m[1]} has no stepUp`);
    if (!/roles: \['super_admin'\]/.test(m[2])) fail(file, `${m[1]} is not limited to super_admin`);
  }
}

// 7
{
  const core = readFileSync('services/payment/webhook-core.ts', 'utf8');
  const verify = core.indexOf('adapter.verifyWebhook');
  const parse = core.indexOf('adapter.parseWebhook');
  const store = core.indexOf(".from('webhook_events')\n    .insert");
  if (verify < 0 || parse < 0 || store < 0 || !(verify < parse && parse < store)) {
    fail('services/payment/webhook-core.ts', 'order must be verify, parse, store');
  }
}

if (problems.length > 0) {
  process.stderr.write(`${problems.join('\n')}\nFAIL step10-static (${problems.length})\n`);
  process.exit(1);
}
process.stdout.write(`ok    step10-static (${codeFiles.length} files)\n`);
