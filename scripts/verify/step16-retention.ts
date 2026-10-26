// path: scripts/verify/step16-retention.ts
// Exit survey and retention offers: the fixed reasons, survey and offer input, which offer fits a reason, the stay rate, and the
// cancel and plan-change routes accepting an optional survey.
// Run: SKIP_ENV_VALIDATION=1 npx tsx scripts/verify/step16-retention.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  REASON_CODES,
  bestOffer,
  offerActionSchema,
  offerQuerySchema,
  saveRate,
  savedSchema,
  surveyAnswerSchema,
  type OfferRow,
} from '@/lib/platform/retention';

const id = '0192f0a0-0000-7000-8000-000000000001';
const offer = (o: Partial<OfferRow> & { id: string }): OfferRow => ({
  triggerKind: 'cancel',
  reasonCode: null,
  title: 'Stay',
  message: 'Stay with us',
  couponCode: null,
  createdAt: '2026-10-01T00:00:00Z',
  ...o,
});
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

check('seven fixed reasons that match the migration', () => {
  assert.equal(REASON_CODES.length, 7);
  const sql = readFileSync('migrations/S16_036_retention.sql', 'utf8');
  for (const c of REASON_CODES) assert.ok(sql.includes(`'${c}'`), c);
});
check('survey answer: known reason, plain detail, no extra fields', () => {
  const a = { reasonCode: 'too_expensive', detail: 'Too much for us', offerId: null };
  assert.ok(surveyAnswerSchema.safeParse(a).success);
  assert.ok(!surveyAnswerSchema.safeParse({ ...a, reasonCode: 'rude' }).success);
  assert.ok(!surveyAnswerSchema.safeParse({ ...a, detail: '<b>x</b>' }).success);
  assert.ok(!surveyAnswerSchema.safeParse({ ...a, detail: 'x'.repeat(501) }).success);
  assert.ok(!surveyAnswerSchema.safeParse({ ...a, extra: 1 }).success);
  assert.ok(!surveyAnswerSchema.safeParse({ ...a, offerId: 'x' }).success);
});
check('saved input and offer query', () => {
  const s = {
    trigger: 'downgrade',
    reasonCode: 'not_using',
    detail: '',
    offerId: id,
    planTo: 'free',
  };
  assert.ok(savedSchema.safeParse(s).success);
  assert.ok(!savedSchema.safeParse({ ...s, trigger: 'pause' }).success);
  assert.ok(!savedSchema.safeParse({ ...s, planTo: 'Free Plan' }).success);
  assert.ok(offerQuerySchema.safeParse({ trigger: 'cancel', reasonCode: 'support' }).success);
  assert.ok(!offerQuerySchema.safeParse({ trigger: 'cancel' }).success);
});
check('offer input: coupon code has the coupon shape and is upper-cased', () => {
  const base = {
    action: 'save',
    trigger: 'cancel',
    reasonCode: null,
    title: 'Stay for half',
    message: 'Half off for three months.',
    couponCode: 'stay-50',
  };
  const parsed = offerActionSchema.parse(base);
  assert.equal(parsed.action === 'save' && parsed.couponCode, 'STAY-50');
  assert.ok(offerActionSchema.safeParse({ ...base, couponCode: null }).success);
  assert.ok(!offerActionSchema.safeParse({ ...base, couponCode: 'a b!' }).success);
  assert.ok(!offerActionSchema.safeParse({ ...base, title: 'ab' }).success);
  assert.ok(offerActionSchema.safeParse({ action: 'disable', id }).success);
  assert.ok(!offerActionSchema.safeParse({ action: 'delete', id }).success);
});
check(
  'the offer for a reason wins over one for any reason, the newest wins among equals, the trigger must match',
  () => {
    const any = offer({ id: 'any', createdAt: '2026-10-05T00:00:00Z' });
    const pricey = offer({
      id: 'pricey',
      reasonCode: 'too_expensive',
      createdAt: '2026-10-01T00:00:00Z',
    });
    const priceyNew = offer({
      id: 'priceyNew',
      reasonCode: 'too_expensive',
      createdAt: '2026-10-03T00:00:00Z',
    });
    const down = offer({ id: 'down', triggerKind: 'downgrade', reasonCode: 'too_expensive' });
    assert.equal(bestOffer([any, pricey], 'cancel', 'too_expensive')?.id, 'pricey');
    assert.equal(bestOffer([any, pricey, priceyNew], 'cancel', 'too_expensive')?.id, 'priceyNew');
    assert.equal(bestOffer([any, pricey], 'cancel', 'support')?.id, 'any');
    assert.equal(bestOffer([pricey], 'cancel', 'support'), null);
    assert.equal(bestOffer([down], 'cancel', 'too_expensive'), null);
    assert.equal(bestOffer([], 'cancel', 'other'), null);
  },
);
check('stay rate', () => {
  assert.equal(saveRate(0, 0), null);
  assert.equal(saveRate(1, 3), 33);
  assert.equal(saveRate(2, 3), 67);
  assert.equal(saveRate(5, 5), 100);
});
check('the cancel and change routes take an optional survey', () => {
  for (const f of [
    'app/api/subscriptions/cancel/route.ts',
    'app/api/subscriptions/change/route.ts',
  ])
    assert.ok(readFileSync(f, 'utf8').includes('surveyAnswerSchema.optional()'), f);
});

process.stdout.write(`step16-retention: ${checks} checks passed\n`);
