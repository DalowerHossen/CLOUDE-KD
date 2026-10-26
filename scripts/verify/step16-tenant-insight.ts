// path: scripts/verify/step16-tenant-insight.ts
// Health score and churn signals of a company, the search text rules, and the support bundle never reading secret columns.
// Run: SKIP_ENV_VALIDATION=1 npx tsx scripts/verify/step16-tenant-insight.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MAX_SEARCH,
  MIN_SEARCH,
  patternSafe,
  paymentFilter,
  searchQuery,
} from '@/lib/platform/global-search';
import { daysLate, insight, loginDrop, type InsightFacts } from '@/lib/platform/tenant-insight';

const calm: InsightFacts = {
  status: 'active',
  openInvoicesOverdue: 0,
  failedPayouts90d: 0,
  chargebacks90d: 0,
  usagePercent: 50,
  daysSinceLastInvoice: 3,
  signIns30d: 40,
  signInsPrev30d: 40,
  planInvoiceDaysLate: 0,
  openUrgentTickets: 0,
};
let checks = 0;
const check = (name: string, fn: () => void): void => {
  try {
    fn();
    checks += 1;
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    throw error;
  }
};

check('a calm company scores 100 with no signals', () => {
  const r = insight(calm);
  assert.equal(r.score, 100);
  assert.equal(r.risk, 'low');
  assert.deepEqual(r.signals, []);
});
check('sign-in drop needs history and a fall of more than 60 percent', () => {
  assert.equal(loginDrop(4, 10), false);
  assert.equal(loginDrop(3, 10), true);
  assert.equal(loginDrop(0, 4), false);
  assert.equal(loginDrop(0, 5), true);
  assert.equal(loginDrop(40, 40), false);
  const r = insight({ ...calm, signIns30d: 2, signInsPrev30d: 40 });
  assert.equal(r.score, 85);
  assert.equal(r.signals[0]?.key, 'login_drop');
});
check('a late plan invoice and urgent tickets lower the score', () => {
  const late = insight({ ...calm, planInvoiceDaysLate: 4 });
  assert.equal(late.score, 91);
  assert.equal(late.signals[0]?.key, 'payment_delay');
  assert.equal(insight({ ...calm, planInvoiceDaysLate: 99 }).score, 80);
  const tickets = insight({ ...calm, openUrgentTickets: 2 });
  assert.equal(tickets.score, 90);
  assert.equal(tickets.signals[0]?.key, 'support_trouble');
  assert.equal(insight({ ...calm, openUrgentTickets: 20 }).score, 85);
});
check('everything wrong stays inside 0 to 100 and is high risk', () => {
  const r = insight({
    status: 'past_due',
    openInvoicesOverdue: 5,
    failedPayouts90d: 5,
    chargebacks90d: 5,
    usagePercent: 1,
    daysSinceLastInvoice: 200,
    signIns30d: 0,
    signInsPrev30d: 50,
    planInvoiceDaysLate: 30,
    openUrgentTickets: 9,
  });
  assert.equal(r.score, 0);
  assert.equal(r.risk, 'high');
  assert.equal(r.signals.length, 3);
});
check('days late', () => {
  const now = new Date('2026-10-26T12:00:00Z');
  assert.equal(daysLate(null, now), 0);
  assert.equal(daysLate('2026-10-27T00:00:00Z', now), 0);
  assert.equal(daysLate('2026-10-23T12:00:00Z', now), 3);
});
check('search text: length, no angle brackets, no wildcard', () => {
  assert.equal(MIN_SEARCH, 3);
  assert.ok(searchQuery.safeParse({ q: '  acme  ' }).success);
  assert.ok(!searchQuery.safeParse({ q: 'ab' }).success);
  assert.ok(!searchQuery.safeParse({ q: 'x'.repeat(MAX_SEARCH + 1) }).success);
  assert.ok(!searchQuery.safeParse({ q: '<script>' }).success);
  assert.ok(!searchQuery.safeParse({ q: 'acme', extra: 1 }).success);
  assert.equal(patternSafe('a%b_c,d(e)f\\g*h'), 'a b c d e f g h');
  assert.equal(patternSafe('%%%'), '');
});
check(
  'payment search: an id matches by id, other text by transaction and trace id, and wildcards are cleaned',
  () => {
    const id = '0192f0a0-0000-7000-8000-000000000001';
    assert.ok(paymentFilter(id).startsWith(`id.eq.${id},`));
    assert.equal(
      paymentFilter('ch3Abc'),
      'processor_transaction_id.ilike.%ch3Abc%,correlation_id.ilike.%ch3Abc%'.replace(
        'ch3Abc',
        'ch3Abc',
      ),
    );
    assert.ok(!paymentFilter('a%b,id.eq.x').includes('%b,id'));
  },
);
check('the support bundle reads no secret columns', () => {
  const src = readFileSync('services/platform/tenant-export.ts', 'utf8');
  const selected = [...src.matchAll(/\.select\(\s*'([^']+)'/g)].map((m) => m[1]).join(',');
  for (const bad of [
    'secret',
    'token',
    'password',
    'credential',
    'iban',
    'account_number',
    'details_encrypted',
    'card',
  ])
    assert.ok(!selected.includes(bad), bad);
});

process.stdout.write(`step16-tenant-insight: ${checks} checks passed\n`);
