// path: scripts/verify/step14-coupons.ts
// Logic checks of coupons (14.7) that need no database: code form and generation, coupon input, the discount maths, the
// reasons a coupon is refused, and the way a discount shows on an invoice. The one-use and total-limit rules are checked
// in the database by sql/assertions/s14_007_coupons.sql and scripts/verify/step14-coupons.sh (parallel companies).
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step14-coupons.ts
import assert from 'node:assert/strict';
import {
  COUPON_MESSAGES,
  codeSchema,
  couponInput,
  couponProblem,
  couponUpdateInput,
  discountFor,
  generateCode,
  normalizeCode,
  type CouponFacts,
} from '@/lib/payment/coupon-rules';
import { withTax } from '@/lib/payment/subscription-rules';
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
const facts = (over: Partial<CouponFacts> = {}): CouponFacts => ({
  kind: 'percent',
  percentOff: '20',
  amountOff: null,
  enabled: true,
  startsAt: null,
  expiresAt: null,
  planSlugs: [],
  maxRedemptions: null,
  oncePerCompany: true,
  ...over,
});
const ctx = {
  now: new Date('2026-10-19T00:00:00Z'),
  planSlug: 'pro',
  redemptions: 0,
  usedByCompany: false,
};

check('codes are trimmed, upper case, and generated without confusing letters', () => {
  assert.equal(normalizeCode(' save20 '), 'SAVE20');
  assert.equal(codeSchema.parse(' save-20 '), 'SAVE-20');
  assert.ok(!codeSchema.safeParse('ab').success);
  assert.ok(!codeSchema.safeParse('has space').success);
  assert.ok(!codeSchema.safeParse('<script>').success);
  const seen = new Set<string>();
  for (let i = 0; i < 200; i += 1) {
    const c = generateCode();
    assert.match(c, /^KD-[A-HJ-NP-Z2-9]{8}$/);
    seen.add(c);
  }
  assert.ok(seen.size > 195, 'generated codes do not repeat');
});

check('the discount is a percent or a fixed amount and never more than the amount', () => {
  assert.equal(discountFor(facts(), m('100')).toDbString(), '20.0000');
  assert.equal(discountFor(facts({ percentOff: '12.5' }), m('80')).toDbString(), '10.0000');
  assert.equal(
    discountFor(facts({ kind: 'fixed', percentOff: null, amountOff: '10' }), m('100')).toDbString(),
    '10.0000',
  );
  assert.equal(
    discountFor(
      facts({ kind: 'fixed', percentOff: null, amountOff: '500' }),
      m('100'),
    ).toDbString(),
    '100.0000',
  );
  assert.equal(discountFor(facts({ percentOff: '100' }), m('100')).toDbString(), '100.0000');
  assert.equal(
    discountFor(facts({ kind: 'free_trial', percentOff: null }), m('100')).toDbString(),
    '0.0000',
  );
  assert.equal(discountFor(facts(), Money.zero()).toDbString(), '0.0000');
});

check('a discounted invoice: tax is on the price after the discount', () => {
  const subtotal = m('100').sub(discountFor(facts(), m('100')));
  const t = withTax(subtotal, '10');
  assert.deepEqual(
    [t.subtotal.toDbString(), t.taxAmount.toDbString(), t.total.toDbString()],
    ['80.0000', '8.0000', '88.0000'],
  );
});

check('every reason a coupon is refused, in the order the database checks them', () => {
  assert.equal(couponProblem(facts(), ctx), null);
  assert.equal(couponProblem(facts({ enabled: false }), ctx), 'disabled');
  assert.equal(couponProblem(facts({ startsAt: '2026-11-01T00:00:00Z' }), ctx), 'not_started');
  assert.equal(couponProblem(facts({ expiresAt: '2026-10-19T00:00:00Z' }), ctx), 'expired');
  assert.equal(couponProblem(facts({ expiresAt: '2026-10-19T00:00:01Z' }), ctx), null);
  assert.equal(couponProblem(facts({ planSlugs: ['business'] }), ctx), 'wrong_plan');
  assert.equal(couponProblem(facts({ planSlugs: ['pro', 'business'] }), ctx), null);
  assert.equal(couponProblem(facts(), { ...ctx, usedByCompany: true }), 'already_used');
  assert.equal(
    couponProblem(facts({ oncePerCompany: false }), { ...ctx, usedByCompany: true }),
    null,
  );
  assert.equal(couponProblem(facts({ maxRedemptions: 5 }), { ...ctx, redemptions: 5 }), 'used_up');
  assert.equal(couponProblem(facts({ maxRedemptions: 5 }), { ...ctx, redemptions: 4 }), null);
  assert.equal(
    couponProblem(facts({ enabled: false, expiresAt: '2020-01-01T00:00:00Z' }), ctx),
    'disabled',
  );
  for (const message of Object.values(COUPON_MESSAGES))
    assert.ok(message.length > 5 && !/[<>]/.test(message));
});

check('coupon input: each kind needs its own value and nothing else', () => {
  assert.ok(couponInput.safeParse({ name: 'Launch', kind: 'percent', percentOff: '20' }).success);
  assert.ok(
    couponInput.safeParse({ name: 'Ten off', kind: 'fixed', amountOff: '10', cycles: 3 }).success,
  );
  assert.ok(
    couponInput.safeParse({ name: 'Trial', kind: 'free_trial', trialDays: 30, planSlugs: ['pro'] })
      .success,
  );
  assert.ok(!couponInput.safeParse({ name: 'x', kind: 'percent' }).success);
  assert.ok(!couponInput.safeParse({ name: 'x', kind: 'percent', percentOff: '120' }).success);
  assert.ok(
    !couponInput.safeParse({ name: 'x', kind: 'percent', percentOff: '10', amountOff: '5' })
      .success,
  );
  assert.ok(!couponInput.safeParse({ name: 'x', kind: 'fixed' }).success);
  assert.ok(!couponInput.safeParse({ name: 'x', kind: 'free_trial', trialDays: 0 }).success);
  assert.ok(!couponInput.safeParse({ name: '<b>x</b>', kind: 'percent', percentOff: '5' }).success);
  assert.ok(
    !couponInput.safeParse({
      name: 'x',
      kind: 'percent',
      percentOff: '5',
      startsAt: '2026-12-01T00:00:00Z',
      expiresAt: '2026-11-01T00:00:00Z',
    }).success,
  );
  assert.ok(
    !couponInput.safeParse({ name: 'x', kind: 'percent', percentOff: '5', other: 1 }).success,
  );
  assert.equal(
    couponInput.parse({ name: 'x', kind: 'percent', percentOff: '5' }).oncePerCompany,
    true,
  );
  assert.equal(
    couponInput.parse({ name: 'x', kind: 'percent', percentOff: '5', code: 'abc-1' }).code,
    'ABC-1',
  );
});

check('what can change later: not the code, the kind or the value', () => {
  assert.ok(
    couponUpdateInput.safeParse({ enabled: false, maxRedemptions: 10, expiresAt: null }).success,
  );
  assert.ok(!couponUpdateInput.safeParse({ code: 'NEW' }).success);
  assert.ok(!couponUpdateInput.safeParse({ kind: 'fixed' }).success);
  assert.ok(!couponUpdateInput.safeParse({ percentOff: '50' }).success);
});

process.stdout.write(`step14-coupons: ${checks} checks passed\n`);
