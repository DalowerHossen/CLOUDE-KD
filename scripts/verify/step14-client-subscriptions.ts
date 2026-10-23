// path: scripts/verify/step14-client-subscriptions.ts
// Logic checks of client subscriptions (14.8) that need no database: plan input, the price of a cycle with extra seats,
// MRR with a yearly plan, churn and lifetime value, how a pause moves the billing date, a prorated upgrade, the cycle dates
// and the three notices for an unpaid invoice. The unique claim of a billing cycle is checked in the database by
// sql/assertions/s14_008_client_subscriptions.sql and scripts/verify/step14-client-subscriptions.sh (parallel).
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step14-client-subscriptions.ts
import assert from 'node:assert/strict';
import {
  churnPercent,
  clientPlanInput,
  clientPlanUpdate,
  cycleAmount,
  lifetimeValue,
  monthlyEquivalent,
  mrrOf,
  shiftAfterPause,
} from '@/lib/payment/client-subscription-rules';
import {
  addInterval,
  changeKind,
  dunningStep,
  graceEndsAt,
  prorate,
  type DunningOutcome,
} from '@/lib/payment/subscription-rules';
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
const m = (v: string): Money => Money.parse(v);
const at = (iso: string): Date => new Date(iso);
interface SubFacts {
  price: string;
  seatPrice: string;
  includedSeats: number;
  seats: number;
  interval: 'month' | 'year';
}
const sub = (price: string, seats = 1, interval: 'month' | 'year' = 'month'): SubFacts => ({
  price,
  seatPrice: '5',
  includedSeats: 2,
  seats,
  interval,
});

check('plan input is strict and plain', () => {
  assert.ok(clientPlanInput.safeParse({ name: 'Gold', price: '49' }).success);
  assert.ok(
    clientPlanInput.safeParse({
      name: 'Gold',
      price: '49',
      interval: 'year',
      features: ['Support', 'Reports'],
      trialDays: 14,
    }).success,
  );
  assert.ok(!clientPlanInput.safeParse({ name: 'Gold', price: '0' }).success);
  assert.ok(!clientPlanInput.safeParse({ name: 'Gold', price: '-5' }).success);
  assert.ok(!clientPlanInput.safeParse({ name: '<b>Gold</b>', price: '49' }).success);
  assert.ok(!clientPlanInput.safeParse({ name: 'Gold', price: '49', interval: 'week' }).success);
  assert.ok(!clientPlanInput.safeParse({ name: 'Gold', price: '49', trialDays: 200 }).success);
  assert.ok(
    !clientPlanInput.safeParse({
      name: 'Gold',
      price: '49',
      features: Array.from({ length: 21 }, () => 'x'),
    }).success,
  );
  assert.ok(!clientPlanInput.safeParse({ name: 'Gold', price: '49', extra: 1 }).success);
  assert.ok(clientPlanUpdate.safeParse({ price: '59' }).success);
  assert.ok(
    !clientPlanUpdate.safeParse({ interval: 'year' }).success,
    'the interval never changes on a plan',
  );
});

check('a cycle costs the price plus the seats above the included seats', () => {
  assert.equal(cycleAmount(sub('49')).toDbString(), '49.0000');
  assert.equal(cycleAmount(sub('49', 2)).toDbString(), '49.0000');
  assert.equal(cycleAmount(sub('49', 5)).toDbString(), '64.0000');
  assert.equal(cycleAmount(sub('49', 1)).toDbString(), '49.0000');
});

check('MRR counts a yearly plan per month', () => {
  assert.equal(monthlyEquivalent(m('120'), 'year').toDbString(), '10.0000');
  assert.equal(monthlyEquivalent(m('120'), 'month').toDbString(), '120.0000');
  assert.equal(mrrOf([sub('49'), sub('120', 1, 'year'), sub('10', 4)]).toDbString(), '79.0000');
  assert.equal(mrrOf([]).toDbString(), '0.0000');
});

check('churn and lifetime value', () => {
  assert.equal(churnPercent(100, 5), '5.00');
  assert.equal(churnPercent(3, 1), '33.33');
  assert.equal(churnPercent(0, 0), null);
  assert.equal(lifetimeValue(m('50'), '5.00')?.toDbString(), '1000.0000');
  assert.equal(lifetimeValue(m('50'), null), null);
  assert.equal(lifetimeValue(m('50'), '0.00'), null);
});

check('a pause moves the next billing date by the time paused', () => {
  const next = at('2026-11-10T00:00:00Z');
  assert.equal(
    shiftAfterPause(next, at('2026-10-20T00:00:00Z'), at('2026-10-30T00:00:00Z')).toISOString(),
    '2026-11-20T00:00:00.000Z',
  );
  assert.equal(
    shiftAfterPause(next, at('2026-10-20T00:00:00Z'), at('2026-10-20T00:00:00Z')).toISOString(),
    next.toISOString(),
  );
  assert.equal(
    shiftAfterPause(next, at('2026-10-30T00:00:00Z'), at('2026-10-20T00:00:00Z')).toISOString(),
    next.toISOString(),
    'never backwards',
  );
});

check(
  'an upgrade in the middle of a cycle is prorated by the day, a downgrade is not billed',
  () => {
    const old = cycleAmount(sub('30'));
    const dearer = cycleAmount(sub('90'));
    assert.equal(changeKind(old, dearer), 'upgrade');
    const p = prorate({
      oldAmount: old,
      newAmount: dearer,
      periodStart: at('2026-10-01T00:00:00Z'),
      periodEnd: at('2026-10-31T00:00:00Z'),
      at: at('2026-10-16T00:00:00Z'),
    });
    assert.equal(p.net.toDbString(), '30.0000');
    assert.equal(changeKind(dearer, old), 'downgrade');
    const down = prorate({
      oldAmount: dearer,
      newAmount: old,
      periodStart: at('2026-10-01T00:00:00Z'),
      periodEnd: at('2026-10-31T00:00:00Z'),
      at: at('2026-10-16T00:00:00Z'),
    });
    assert.equal(down.net.toDbString(), '0.0000');
    // seats: 2 extra seats at 5 each is an upgrade of 10 per cycle
    assert.equal(changeKind(cycleAmount(sub('49', 2)), cycleAmount(sub('49', 4))), 'upgrade');
  },
);

check(
  'cycle dates stay on the same day of the month and a trial pushes the first invoice to its end',
  () => {
    const start = at('2026-01-31T00:00:00Z');
    const first = addInterval(start, 'month');
    assert.equal(first.toISOString(), '2026-02-28T00:00:00.000Z');
    assert.equal(
      addInterval(at('2026-03-15T00:00:00Z'), 'year').toISOString(),
      '2027-03-15T00:00:00.000Z',
    );
    const trialEnd = new Date(at('2026-10-19T00:00:00Z').getTime() + 14 * 86_400_000);
    assert.equal(trialEnd.toISOString(), '2026-11-02T00:00:00.000Z');
    assert.equal(addInterval(trialEnd, 'month').toISOString(), '2026-12-02T00:00:00.000Z');
  },
);

check('an unpaid subscription invoice: three notices, then a grace period, then the end', () => {
  const due = at('2026-11-01T00:00:00Z');
  let attempts = 0;
  let grace: Date | null = null;
  const log: string[] = [];
  for (let hour = 0; hour <= 24 * 20; hour += 1) {
    const now = new Date(due.getTime() + hour * 3_600_000);
    const step: DunningOutcome = dunningStep({
      dueAt: due,
      attemptsMade: attempts,
      now,
      graceEndsAt: grace,
    });
    if (step.kind === 'attempt') {
      attempts = step.number;
      log.push(`notice ${step.number} on day ${hour / 24}`);
      if (step.last) grace = graceEndsAt(now);
    } else if (step.kind === 'grace_end') {
      log.push(`ended on day ${hour / 24}`);
      break;
    }
  }
  assert.deepEqual(log, [
    'notice 1 on day 0',
    'notice 2 on day 3',
    'notice 3 on day 7',
    'ended on day 14',
  ]);
});

process.stdout.write(`step14-client-subscriptions: ${checks} checks passed\n`);
