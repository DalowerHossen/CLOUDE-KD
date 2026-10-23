// path: scripts/verify/step14-analytics.ts
// Logic checks of the revenue reports (14.10) that need no database: cohort retention, net revenue retention, percent
// maths, and the health score of a company.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step14-analytics.ts
import assert from 'node:assert/strict';
import {
  addMonths,
  cohorts,
  health,
  monthOf,
  netRevenueRetention,
  percentOf,
  type HealthFacts,
} from '@/lib/payment/analytics-rules';
import { Money } from '@/lib/utils/currency';

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

check('months and percents', () => {
  assert.equal(monthOf('2026-10-23T10:00:00Z'), '2026-10');
  assert.equal(addMonths('2026-11', 3), '2027-02');
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.equal(percentOf(1, 3), '33.33');
  assert.equal(percentOf(0, 0), '0.00');
  assert.equal(percentOf(5, 5), '100.00');
});

check('cohorts: a company counts until the month it ends', () => {
  const rows = cohorts(
    [
      { startedAt: '2026-08-05T00:00:00Z', endedAt: null },
      { startedAt: '2026-08-20T00:00:00Z', endedAt: '2026-09-10T00:00:00Z' },
      { startedAt: '2026-08-25T00:00:00Z', endedAt: '2026-10-02T00:00:00Z' },
      { startedAt: '2026-09-01T00:00:00Z', endedAt: null },
    ],
    '2026-10',
  );
  assert.deepEqual(
    rows.map((r) => r.cohort),
    ['2026-08', '2026-09'],
  );
  assert.equal(rows[0]?.size, 3);
  assert.deepEqual(rows[0]?.retention, ['100.00', '66.67', '33.33']);
  assert.deepEqual(rows[1]?.retention, ['100.00', '100.00']);
});

check('net revenue retention counts upgrades and loss', () => {
  assert.equal(netRevenueRetention(Money.parse('100'), Money.parse('110')), '110.0000');
  assert.equal(netRevenueRetention(Money.parse('100'), Money.parse('60')), '60.0000');
  assert.equal(netRevenueRetention(Money.zero(), Money.parse('10')), null);
});

check('health score falls with each problem and has plain reasons', () => {
  const ok: HealthFacts = {
    status: 'active',
    openInvoicesOverdue: 0,
    failedPayouts90d: 0,
    chargebacks90d: 0,
    usagePercent: 50,
    daysSinceLastInvoice: 5,
  };
  assert.deepEqual(health(ok), { score: 100, risk: 'low', reasons: [] });
  assert.equal(health({ ...ok, status: 'past_due' }).score, 60);
  assert.equal(health({ ...ok, status: 'past_due', chargebacks90d: 1 }).risk, 'medium');
  const bad = health({
    ...ok,
    status: 'grace',
    chargebacks90d: 3,
    failedPayouts90d: 2,
    usagePercent: 2,
  });
  assert.equal(bad.risk, 'high');
  assert.ok(bad.reasons.length >= 3);
  assert.ok(health({ ...ok, status: 'ended', chargebacks90d: 9, failedPayouts90d: 9 }).score >= 0);
});

process.stdout.write(`step14-analytics: ${checks} checks passed\n`);
