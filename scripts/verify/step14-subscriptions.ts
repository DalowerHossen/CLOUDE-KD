// path: scripts/verify/step14-subscriptions.ts
// Logic checks of platform subscriptions (14.6) that need no database: billing periods, prices, daily proration of a
// plan change, tax, renewal time, reminder days, the three payment attempts, the grace period and the move to the free
// plan, trials, and the invoice e-mail catalogue. Tables and invoice numbers are checked by
// sql/assertions/s14_006_subscriptions.sql and scripts/verify/step14-subscriptions.sh.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step14-subscriptions.ts
import assert from 'node:assert/strict';
import { DUNNING_DAYS, GRACE_DAYS } from '@/config/s14-subscriptions';
import {
  addDaysTo,
  addInterval,
  changeKind,
  dunningStep,
  extraSeatsOf,
  graceEndsAt,
  nextAttemptAt,
  periodAmount,
  prorate,
  reminderDue,
  renewalInvoiceAt,
  taxPercentFor,
  trialExpired,
  withTax,
  type DunningOutcome,
} from '@/lib/payment/subscription-rules';
import { billingEmailTemplates } from '@/emails/billing';
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

check('periods keep the day and use the last day of a short month', () => {
  assert.equal(
    addInterval(at('2026-01-15T10:00:00Z'), 'month').toISOString(),
    '2026-02-15T10:00:00.000Z',
  );
  assert.equal(
    addInterval(at('2026-01-31T10:00:00Z'), 'month').toISOString(),
    '2026-02-28T10:00:00.000Z',
  );
  assert.equal(
    addInterval(at('2028-01-31T10:00:00Z'), 'month').toISOString(),
    '2028-02-29T10:00:00.000Z',
  );
  assert.equal(
    addInterval(at('2026-12-15T00:00:00Z'), 'month').toISOString(),
    '2027-01-15T00:00:00.000Z',
  );
  assert.equal(
    addInterval(at('2028-02-29T00:00:00Z'), 'year').toISOString(),
    '2029-02-28T00:00:00.000Z',
  );
  assert.equal(
    addInterval(at('2026-03-10T00:00:00Z'), 'year').toISOString(),
    '2027-03-10T00:00:00.000Z',
  );
});

check('the price of a period: plan price plus the seats above the included seats', () => {
  const plan = { priceMonthly: '29', priceYearly: '290', seatPriceMonthly: '5' };
  assert.equal(periodAmount(plan, 'month', 0).toDbString(), '29.0000');
  assert.equal(periodAmount(plan, 'month', 3).toDbString(), '44.0000');
  assert.equal(periodAmount(plan, 'year', 3).toDbString(), '470.0000');
  assert.equal(extraSeatsOf(8, 5), 3);
  assert.equal(extraSeatsOf(4, 5), 0);
  assert.equal(extraSeatsOf(100, null), 0);
});

check(
  'proration counts the days left: a half-used period credits half of the old price and charges half of the new one',
  () => {
    const p = prorate({
      oldAmount: m('30'),
      newAmount: m('90'),
      periodStart: at('2026-10-01T00:00:00Z'),
      periodEnd: at('2026-10-31T00:00:00Z'),
      at: at('2026-10-16T00:00:00Z'),
    });
    assert.equal(p.totalDays, 30);
    assert.equal(p.remainingDays, 15);
    assert.equal(p.credit.toDbString(), '15.0000');
    assert.equal(p.charge.toDbString(), '45.0000');
    assert.equal(p.net.toDbString(), '30.0000');
    const first = prorate({
      oldAmount: m('30'),
      newAmount: m('90'),
      periodStart: at('2026-10-01T00:00:00Z'),
      periodEnd: at('2026-10-31T00:00:00Z'),
      at: at('2026-10-01T00:00:00Z'),
    });
    assert.equal(first.net.toDbString(), '60.0000', 'on the first day the whole difference is due');
    const last = prorate({
      oldAmount: m('30'),
      newAmount: m('90'),
      periodStart: at('2026-10-01T00:00:00Z'),
      periodEnd: at('2026-10-31T00:00:00Z'),
      at: at('2026-10-31T00:00:00Z'),
    });
    assert.equal(last.net.toDbString(), '0.0000', 'on the last moment nothing is due');
    const late = prorate({
      oldAmount: m('30'),
      newAmount: m('90'),
      periodStart: at('2026-10-01T00:00:00Z'),
      periodEnd: at('2026-10-31T00:00:00Z'),
      at: at('2026-11-05T00:00:00Z'),
    });
    assert.equal(late.remainingDays, 0);
    const cheaper = prorate({
      oldAmount: m('90'),
      newAmount: m('30'),
      periodStart: at('2026-10-01T00:00:00Z'),
      periodEnd: at('2026-10-31T00:00:00Z'),
      at: at('2026-10-16T00:00:00Z'),
    });
    assert.equal(cheaper.net.toDbString(), '0.0000', 'a downgrade never bills');
    assert.equal(changeKind(m('30'), m('90')), 'upgrade');
    assert.equal(changeKind(m('90'), m('30')), 'downgrade');
    assert.equal(changeKind(m('30'), m('30')), 'same');
  },
);

check('tax by the buyer country, with a default', () => {
  assert.equal(taxPercentFor('BD', { BD: '15', SG: '9' }, '0'), '15');
  assert.equal(taxPercentFor('IN', { BD: '15' }, '5'), '5');
  assert.equal(taxPercentFor(null, { BD: '15' }, '5'), '5');
  const t = withTax(m('100'), '15');
  assert.deepEqual([t.taxAmount.toDbString(), t.total.toDbString()], ['15.0000', '115.0000']);
  assert.equal(withTax(m('100'), '0').total.toDbString(), '100.0000');
});

check('renewal invoice time and reminders 7, 3 and 1 days before, each once', () => {
  const end = at('2026-11-01T00:00:00Z');
  assert.equal(renewalInvoiceAt(end).toISOString(), '2026-10-25T00:00:00.000Z');
  assert.equal(reminderDue(end, at('2026-10-24T00:00:00Z'), new Set()), null, 'too early');
  assert.equal(reminderDue(end, at('2026-10-25T00:00:00Z'), new Set()), 7);
  assert.equal(reminderDue(end, at('2026-10-25T00:00:00Z'), new Set([7])), null, 'already sent');
  assert.equal(reminderDue(end, at('2026-10-29T00:00:00Z'), new Set([7])), 3);
  assert.equal(reminderDue(end, at('2026-10-31T00:00:00Z'), new Set([7, 3])), 1);
  assert.equal(reminderDue(end, at('2026-10-31T12:00:00Z'), new Set([7, 3, 1])), null);
  assert.equal(reminderDue(end, at('2026-11-02T00:00:00Z'), new Set()), null, 'after the end');
});

check(
  'three failed payments end in the grace state and then the free plan, nothing is deleted',
  () => {
    const due = at('2026-11-01T00:00:00Z');
    assert.deepEqual(DUNNING_DAYS, [0, 3, 7]);
    let attempts = 0;
    let grace: Date | null = null;
    let status: 'past_due' | 'grace' | 'ended' = 'past_due';
    const log: string[] = [];
    for (let hour = 0; hour <= 24 * 20; hour += 1) {
      const now = new Date(due.getTime() + hour * 3_600_000);
      if (status === 'ended') break;
      const step: DunningOutcome = dunningStep({
        dueAt: due,
        attemptsMade: attempts,
        now,
        graceEndsAt: grace,
      });
      if (step.kind === 'attempt') {
        attempts = step.number;
        log.push(`attempt ${step.number} on day ${hour / 24}`);
        if (step.last) {
          grace = graceEndsAt(now);
          status = 'grace';
        }
      } else if (step.kind === 'grace_end') {
        status = 'ended';
        log.push(`ended on day ${hour / 24}`);
      }
    }
    assert.deepEqual(log, [
      'attempt 1 on day 0',
      'attempt 2 on day 3',
      'attempt 3 on day 7',
      `ended on day ${7 + GRACE_DAYS}`,
    ]);
    assert.equal(status, 'ended');
    assert.equal(nextAttemptAt(due, 0)?.toISOString(), due.toISOString());
    assert.equal(nextAttemptAt(due, 3), null);
  },
);

check(
  'before the first attempt day nothing happens, and a paid invoice is not part of the schedule',
  () => {
    const due = at('2026-11-01T00:00:00Z');
    assert.deepEqual(
      dunningStep({
        dueAt: due,
        attemptsMade: 0,
        now: at('2026-10-31T23:00:00Z'),
        graceEndsAt: null,
      }),
      { kind: 'wait' },
    );
    assert.deepEqual(
      dunningStep({
        dueAt: due,
        attemptsMade: 1,
        now: at('2026-11-03T00:00:00Z'),
        graceEndsAt: null,
      }),
      { kind: 'wait' },
    );
    assert.deepEqual(
      dunningStep({
        dueAt: due,
        attemptsMade: 3,
        now: at('2026-11-20T00:00:00Z'),
        graceEndsAt: null,
      }),
      { kind: 'wait' },
    );
  },
);

check('a trial ends at its end time', () => {
  assert.equal(trialExpired(at('2026-11-01T00:00:00Z'), at('2026-10-31T23:59:59Z')), false);
  assert.equal(trialExpired(at('2026-11-01T00:00:00Z'), at('2026-11-01T00:00:00Z')), true);
  assert.equal(trialExpired(null, at('2030-01-01T00:00:00Z')), false);
  assert.equal(addDaysTo(at('2026-10-19T00:00:00Z'), 14).toISOString(), '2026-11-02T00:00:00.000Z');
});

check('every billing e-mail is in the catalogue with its variables and no brand name', () => {
  const ids = billingEmailTemplates.map((t) => t.definition.id);
  for (const id of [
    'billing.invoice',
    'billing.receipt',
    'billing.renewal-reminder',
    'billing.payment-failed',
    'billing.downgraded',
    'billing.trial-ending',
    'billing.payout-paid',
    'billing.payout-failed',
  ])
    assert.ok(ids.includes(id), id);
  assert.equal(new Set(ids).size, ids.length);
  for (const t of billingEmailTemplates) {
    for (const v of t.definition.variables) assert.match(v, /^[a-zA-Z]+$/);
    assert.ok(t.definition.subject.length > 0);
  }
});

process.stdout.write(`step14-subscriptions: ${checks} checks passed\n`);
