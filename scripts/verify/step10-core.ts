// path: scripts/verify/step10-core.ts
// Logic checks of STEP 10 that need no database or network. Run: npx tsx scripts/verify/step10-core.ts
import assert from 'node:assert/strict';
import { PROCESSORS } from '@/config/processors';
import { Money } from '@/lib/utils/currency';
import { adapterProblems, requireCapture, requireRefund } from '@/lib/payment/capabilities';
import { buildTransaction, defineAdapter, safeEqual } from '@/lib/payment/adapters/base';
import { customerMessage, isCountedFailure, normalizeCategory } from '@/lib/payment/decline';
import {
  clearAdapterCache,
  hasAdapter,
  isKnownProcessor,
  listRegistry,
  loadAdapter,
  registerAdapterForVerification,
} from '@/lib/payment/registry';
import {
  credentialFormFields,
  credentialSchema,
  parseCredentials,
} from '@/schemas/payment/credentials';
import {
  describeCredentials,
  openCredentials,
  sealCredentials,
  tailOf,
} from '@/lib/payment/credentials';
import { registerService, unregisterService } from '@/lib/container';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { defaultMode, hasChoice, requireMode, testStillValid } from '@/lib/payment/modes';
import {
  evaluateRouting,
  ruleMatches,
  ruleProblems,
  sortRules,
  type RoutingRule,
} from '@/lib/payment/routing';
import { routingRuleCreateSchema } from '@/schemas/payment/routing';
import {
  describeRule,
  evaluateAddressRules,
  evaluateCardRules,
  identityHmac,
  CARD_RULE_CODES,
  type CardRuleDecision,
  type CardStats,
} from '@/lib/payment/card-rules';
import {
  PAYMENT_TRANSITIONS,
  canTransition,
  holdsMoney,
  isOpen,
  isTerminal,
  refundable,
  statusAfterRefund,
  surchargeFor,
} from '@/lib/payment/state-machine';
import {
  assessVerification,
  normalizePostal,
  postalMatches,
  reviewHoldHours,
  reviewHoldUntil,
  threeDSPolicyFor,
} from '@/lib/payment/verification';
import { createPaymentSchema, refundBodySchema } from '@/schemas/payment/payments';
import { reviewDecisionSchema } from '@/schemas/payment/review';
import {
  FORBIDDEN_PAYMENT_PAGE_HOSTS,
  originsOf,
  paymentPageOrigins,
  violatesPaymentProfile,
} from '@/lib/payment/csp';
import { percentText } from '@/services/payment/report-math';
import { linkCreateSchema, linkPayBodySchema, tokenParam } from '@/schemas/payment/payments';
import { processorActionSchema, processorIdSchema } from '@/schemas/payment/processors';
import { PROCESSOR_IDS, type EncryptedPayload, type ProcessorAdapter } from '@/types/contracts';

const testKey = randomBytes(32);
function installFakeEncryption(): void {
  unregisterService('encryption');
  registerService('encryption', {
    async encrypt(_purpose, plaintext, scope) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', testKey, iv);
      cipher.setAAD(Buffer.from(scope ?? ''));
      const data = typeof plaintext === 'string' ? Buffer.from(plaintext) : Buffer.from(plaintext);
      const ct = Buffer.concat([cipher.update(data), cipher.final()]);
      return {
        ciphertext: ct.toString('base64'),
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        keyVersion: 1,
      };
    },
    async decrypt(_purpose, payload: EncryptedPayload, scope) {
      const decipher = createDecipheriv('aes-256-gcm', testKey, Buffer.from(payload.iv, 'base64'));
      decipher.setAAD(Buffer.from(scope ?? ''));
      decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
      return new Uint8Array(
        Buffer.concat([
          decipher.update(Buffer.from(payload.ciphertext, 'base64')),
          decipher.final(),
        ]),
      );
    },
  });
}

let checks = 0;
function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve(fn())
    .then(() => {
      checks += 1;
    })
    .catch((e: unknown) => {
      process.stderr.write(`FAIL ${name}\n`);
      throw e;
    });
}

const fake: ProcessorAdapter = defineAdapter({
  id: 'stripe',
  displayName: 'Fake',
  capabilities: {
    supportsAuthCapture: true,
    supportsThreeDS: true,
    supportsRefund: true,
    supportsPartialRefund: false,
    supportsRecurring: false,
    supportsPayout: false,
    isMerchantOfRecord: false,
    modes: [{ id: 'default', label: 'Default', isDefault: true }],
    currencies: ['USD'],
  },
  credentialFields: [
    {
      key: 'secretKey',
      label: 'Secret key',
      secret: true,
      required: true,
      pattern: '^sk_[A-Za-z0-9_]{8,}$',
    },
    { key: 'accountLabel', label: 'Label', secret: false, required: false },
  ],
  testConnection: async () => ({ ok: true, message: 'ok' }),
  createCheckoutSession: async () => ({ clientConfig: {}, expiresAt: null }),
  authorize: async (_c, i) => buildTransaction({ status: 'authorized', amount: i.amount }),
  capture: async (_c, i) => buildTransaction({ status: 'captured', amount: i.amount }),
  voidAuthorization: async () => buildTransaction({ status: 'voided', amount: Money.from('0') }),
  refund: async (_c, i) => buildTransaction({ status: 'refunded', amount: i.amount }),
  getTransaction: async () => buildTransaction({ status: 'pending', amount: Money.from('0') }),
  verifyWebhook: async () => true,
  parseWebhook: () => {
    throw new Error('not used');
  },
  cardIdentity: () => null,
  mapDecline: () => 'other',
});

async function main(): Promise<void> {
  await check('sixteen processors with unique ids', () => {
    assert.equal(PROCESSORS.length, 16);
    assert.equal(new Set(PROCESSORS.map((p) => p.id)).size, 16);
    assert.deepEqual([...PROCESSORS.map((p) => p.id)].sort(), [...PROCESSOR_IDS].sort());
    for (const p of PROCESSORS) assert.ok(p.step === 11 || p.step === 12);
  });
  await check('STEP 11 and 12 split matches the plan', () => {
    const s11 = PROCESSORS.filter((p) => p.step === 11)
      .map((p) => p.id)
      .sort();
    assert.deepEqual(s11, [
      'authorizenet',
      'bluesnap',
      'braintree',
      'payarc',
      'paypal',
      'square',
      'stripe',
      'verifone',
    ]);
  });
  await check('registry lists all sixteen, unavailable without an adapter file', () => {
    clearAdapterCache();
    const list = listRegistry();
    assert.equal(list.length, 16);
    for (const e of list) assert.equal(e.available, hasAdapter(e.metadata.id));
  });
  await check('unknown processor id is refused', async () => {
    assert.equal(isKnownProcessor('bkash'), false);
    await assert.rejects(() => loadAdapter('bkash'));
    await assert.rejects(() => loadAdapter('../etc/passwd'));
  });
  await check('a known processor without an adapter is refused', async () => {
    clearAdapterCache();
    const missing = PROCESSORS.find((p) => !hasAdapter(p.id));
    if (missing) await assert.rejects(() => loadAdapter(missing.id), /no adapter/);
  });
  await check('a valid adapter loads and is cached', async () => {
    registerAdapterForVerification(fake);
    assert.equal(await loadAdapter('stripe'), fake);
  });
  await check('contract problems are found', () => {
    assert.deepEqual(adapterProblems(fake), []);
    const broken: ProcessorAdapter = { ...fake, capture: undefined };
    assert.ok(adapterProblems(broken).some((p) => p.includes('capture')));
    const noCharge: ProcessorAdapter = {
      ...fake,
      capabilities: { ...fake.capabilities, supportsAuthCapture: false },
    };
    assert.ok(adapterProblems(noCharge).some((p) => p.includes('charge')));
    const twoDefaults: ProcessorAdapter = {
      ...fake,
      capabilities: {
        ...fake.capabilities,
        modes: [
          { id: 'a', label: 'A', isDefault: true },
          { id: 'b', label: 'B', isDefault: true },
        ],
      },
    };
    assert.ok(adapterProblems(twoDefaults).some((p) => p.includes('default mode')));
  });
  await check('capability checks refuse missing operations', () => {
    assert.doesNotThrow(() => requireCapture(fake));
    assert.throws(() => requireRefund(fake, true));
    assert.doesNotThrow(() => requireRefund(fake, false));
  });
  await check(
    'credential form is generated from the fields and hides nothing it should show',
    () => {
      const fields = credentialFormFields(fake);
      assert.deepEqual(
        fields.map((f) => f.key),
        ['secretKey', 'accountLabel'],
      );
      assert.equal(fields[0]?.secret, true);
      assert.ok(!('value' in (fields[0] ?? {})));
    },
  );
  await check('credential schema is strict and checks formats', () => {
    const schema = credentialSchema(fake);
    assert.ok(schema.safeParse({ secretKey: 'sk_test_12345678' }).success);
    assert.ok(!schema.safeParse({}).success);
    assert.ok(!schema.safeParse({ secretKey: 'bad' }).success);
    assert.ok(!schema.safeParse({ secretKey: 'sk_test_12345678', extra: 'x' }).success);
    assert.ok(
      !schema.safeParse({ secretKey: 'sk_test_12345678\nX', accountLabel: 'a\u0000b' }).success,
    );
    assert.deepEqual(parseCredentials(fake, { secretKey: ' sk_test_12345678 ' }), {
      secretKey: 'sk_test_12345678',
    });
  });
  await check('decline helpers', () => {
    assert.equal(isCountedFailure('invalid_cvv'), true);
    assert.equal(isCountedFailure('three_ds_failed'), true);
    assert.equal(isCountedFailure('insufficient_funds'), false);
    assert.equal(isCountedFailure('processor_error'), false);
    assert.equal(isCountedFailure(null), false);
    assert.equal(normalizeCategory('nonsense'), 'other');
    assert.equal(normalizeCategory('do_not_honor'), 'do_not_honor');
    assert.ok(!customerMessage('processor_fraud_signal').toLowerCase().includes('fraud'));
  });
  await check('safeEqual', () => {
    assert.equal(safeEqual('abc', 'abc'), true);
    assert.equal(safeEqual('abc', 'abd'), false);
    assert.equal(safeEqual('abc', 'abcd'), false);
  });
  await check(
    'vault: seal and open round trip, nothing readable in the stored fields',
    async () => {
      installFakeEncryption();
      const secret = 'sk_test_ABCDEFGH12345678';
      const sealed = await sealCredentials(fake, {
        secretKey: secret,
        accountLabel: 'Main account',
      });
      const stored = JSON.stringify(sealed);
      assert.ok(!stored.includes(secret), 'the secret must not appear in what is stored');
      assert.ok(!stored.includes('ABCDEFGH'), 'only the last characters may appear');
      assert.equal(sealed.lastChars.secretKey, '5678');
      assert.equal(sealed.lastChars.accountLabel, 'Main account');
      assert.deepEqual(sealed.fieldKeys, ['accountLabel', 'secretKey']);
      const opened = await openCredentials('stripe', {
        ciphertext: sealed.payload.ciphertext,
        iv: sealed.payload.iv,
        tag: sealed.payload.tag,
        key_version: sealed.payload.keyVersion,
      });
      assert.equal(opened.secretKey, secret);
      // the scope (processor id) is bound to the ciphertext
      await assert.rejects(() =>
        openCredentials('nmi', {
          ciphertext: sealed.payload.ciphertext,
          iv: sealed.payload.iv,
          tag: sealed.payload.tag,
          key_version: 1,
        }),
      );
    },
  );
  await check('vault: invalid input is refused before encryption', async () => {
    installFakeEncryption();
    await assert.rejects(() => sealCredentials(fake, { secretKey: 'short' }));
    await assert.rejects(() =>
      sealCredentials(fake, { secretKey: 'sk_test_ABCDEFGH12345678', extra: '1' }),
    );
  });
  await check('vault: short secrets show no tail, display never holds the secret', async () => {
    assert.equal(tailOf('abcdefghijk'), null);
    assert.equal(tailOf('abcdefghijkl'), 'ijkl');
    const view = describeCredentials(fake, ['secretKey'], { secretKey: '5678' });
    assert.equal(view[0]?.saved, true);
    assert.ok(view[0]?.display?.endsWith('5678'));
    assert.equal(view[1]?.saved, false);
    assert.equal(view[1]?.display, null);
  });
  await check('admin action schemas are strict', () => {
    assert.ok(processorActionSchema.safeParse({ action: 'enable', expectedVersion: 3 }).success);
    assert.ok(processorActionSchema.safeParse({ action: 'test' }).success);
    assert.ok(
      !processorActionSchema.safeParse({ action: 'enable', expectedVersion: 3, extra: 1 }).success,
    );
    assert.ok(
      !processorActionSchema.safeParse({ action: 'set_environment', environment: 'prod' }).success,
    );
    assert.ok(
      !processorActionSchema.safeParse({ action: 'save_credentials', values: { a: 5 } }).success,
    );
    assert.ok(!processorActionSchema.safeParse({ action: 'delete' }).success);
    assert.ok(processorIdSchema.safeParse('stripe').success);
    assert.ok(!processorIdSchema.safeParse('unknown').success);
  });
  await check('modes: default, unknown refused, test window', () => {
    assert.equal(defaultMode(fake).id, 'default');
    assert.equal(hasChoice(fake), false);
    const two: ProcessorAdapter = {
      ...fake,
      capabilities: {
        ...fake.capabilities,
        modes: [
          { id: 'collectjs', label: 'Collect.js', isDefault: true },
          { id: 'payment_component', label: 'Payment Component', isDefault: false },
        ],
      },
    };
    assert.equal(hasChoice(two), true);
    assert.equal(requireMode(two, 'payment_component').label, 'Payment Component');
    assert.throws(() => requireMode(two, 'other'));
    assert.throws(() => requireMode(two, 'Bad Mode!'));
    const now = new Date('2026-01-02T00:00:00Z');
    assert.equal(testStillValid(new Date('2026-01-01T01:00:00Z'), now), true);
    assert.equal(testStillValid(new Date('2025-12-31T23:59:00Z'), now), false);
    assert.equal(testStillValid(new Date('2026-01-03T00:00:00Z'), now), false);
  });
  await check('routing: first match by priority, no match, no failover to a later rule', () => {
    const mk = (over: Partial<RoutingRule>): RoutingRule => ({
      id: over.id ?? 'r',
      name: 'rule',
      priority: 100,
      processorId: 'stripe',
      minAmount: null,
      maxAmount: null,
      countries: [],
      methods: [],
      plans: [],
      enabled: true,
      createdAt: '2026-01-01T00:00:00Z',
      ...over,
    });
    const rules = [
      mk({ id: 'c', priority: 300, processorId: 'adyen' }),
      mk({
        id: 'a',
        priority: 10,
        processorId: 'nmi',
        minAmount: Money.parse('100'),
        maxAmount: Money.parse('999.9999'),
        countries: ['US', 'CA'],
      }),
      mk({ id: 'b', priority: 20, processorId: 'paypal', plans: ['pro'], methods: ['card'] }),
      mk({ id: 'off', priority: 1, processorId: 'square', enabled: false }),
    ];
    const base = {
      amount: Money.parse('150'),
      country: 'US',
      method: 'card' as const,
      plan: 'free',
    };
    assert.equal(evaluateRouting(rules, base)?.processorId, 'nmi');
    assert.equal(
      evaluateRouting(rules, { ...base, amount: Money.parse('100') })?.processorId,
      'nmi',
    );
    assert.equal(
      evaluateRouting(rules, { ...base, amount: Money.parse('99.9999') })?.processorId,
      'adyen',
    );
    assert.equal(
      evaluateRouting(rules, { ...base, amount: Money.parse('1000') })?.processorId,
      'adyen',
    );
    assert.equal(evaluateRouting(rules, { ...base, country: null })?.processorId, 'adyen');
    assert.equal(
      evaluateRouting(rules, { ...base, country: 'gb', plan: 'pro' })?.processorId,
      'paypal',
    );
    assert.equal(
      evaluateRouting(
        rules.filter((r) => r.id !== 'c'),
        { ...base, country: 'GB' },
      ),
      null,
    );
    assert.equal(evaluateRouting([], base), null);
    assert.equal(ruleMatches(rules[3] as RoutingRule, base), false);
    assert.deepEqual(
      sortRules(rules).map((r) => r.id),
      ['off', 'a', 'b', 'c'],
    );
    assert.equal(
      ruleProblems({ minAmount: Money.parse('5'), maxAmount: Money.parse('4') }).length,
      1,
    );
  });
  await check('routing: rule schema is strict', () => {
    const ok = { name: 'US cards', priority: 10, processorId: 'stripe', countries: ['US'] };
    assert.ok(routingRuleCreateSchema.safeParse(ok).success);
    assert.ok(!routingRuleCreateSchema.safeParse({ ...ok, processorId: 'bkash' }).success);
    assert.ok(!routingRuleCreateSchema.safeParse({ ...ok, countries: ['usa'] }).success);
    assert.ok(!routingRuleCreateSchema.safeParse({ ...ok, minAmount: '12.34567' }).success);
    assert.ok(!routingRuleCreateSchema.safeParse({ ...ok, minAmount: '-1' }).success);
    assert.ok(!routingRuleCreateSchema.safeParse({ ...ok, priority: 0 }).success);
    assert.ok(!routingRuleCreateSchema.safeParse({ ...ok, extra: 1 }).success);
  });
  await check('card rules: each rule, order, limits from config', () => {
    const clean: CardStats = {
      countedFailures: 0,
      cardAttempts: 0,
      ipAttempts: 0,
      ipDistinctCards: 0,
      paidSameInvoice: 0,
    };
    const run = (over: Partial<CardStats>, blacklisted = false): CardRuleDecision =>
      evaluateCardRules({ blacklisted, stats: { ...clean, ...over } });
    assert.deepEqual(run({}), { allowed: true, code: null });
    assert.equal(run({}, true).code, 'card_blacklisted');
    assert.equal(run({ paidSameInvoice: 1 }).code, 'same_card_same_invoice');
    assert.equal(run({ countedFailures: 1 }).allowed, true, 'one failure still allowed');
    assert.equal(
      run({ countedFailures: 2 }).code,
      'card_fail_limit',
      'the third attempt is refused',
    );
    assert.equal(run({ cardAttempts: 5 }).code, 'card_velocity');
    assert.equal(run({ cardAttempts: 4 }).allowed, true);
    assert.equal(run({ ipAttempts: 10 }).code, 'ip_velocity');
    assert.equal(run({ ipDistinctCards: 3 }).code, 'ip_distinct_cards');
    assert.equal(run({ ipDistinctCards: 2 }).allowed, true);
    assert.equal(evaluateAddressRules({ ipAttempts: 10 }).allowed, false);
    assert.equal(
      run({ paidSameInvoice: 1, countedFailures: 9 }).code,
      'same_card_same_invoice',
      'order is fixed',
    );
    assert.equal(run({ countedFailures: 9 }, true).code, 'card_blacklisted', 'blocked list first');
    for (const code of CARD_RULE_CODES) assert.ok(describeRule(code).length > 5);
  });
  await check(
    'card identity: HMAC is stable, keyed, bound to processor and type, hides the value',
    () => {
      const k1 = 'k'.repeat(48);
      const id = { type: 'fingerprint' as const, value: 'fp_ABC123' };
      const a = identityHmac(k1, 'stripe', id);
      assert.match(a, /^[0-9a-f]{64}$/);
      assert.equal(a, identityHmac(k1, 'stripe', id));
      assert.notEqual(a, identityHmac('j'.repeat(48), 'stripe', id));
      assert.notEqual(a, identityHmac(k1, 'nmi', id));
      assert.notEqual(a, identityHmac(k1, 'stripe', { type: 'token', value: id.value }));
      assert.ok(!a.includes('ABC123'));
    },
  );
  await check('state machine: legal moves only, terminal states, refunds', () => {
    assert.ok(canTransition('created', 'authorized'));
    assert.ok(canTransition('authorized', 'captured'));
    assert.ok(canTransition('pending_review', 'voided'));
    assert.ok(canTransition('captured', 'partially_refunded'));
    assert.ok(canTransition('partially_refunded', 'refunded'));
    assert.ok(!canTransition('created', 'refunded'));
    assert.ok(!canTransition('failed', 'captured'));
    assert.ok(!canTransition('voided', 'authorized'));
    assert.ok(!canTransition('captured', 'voided'));
    assert.ok(!canTransition('refunded', 'captured'));
    for (const s of ['failed', 'voided', 'refunded'] as const) assert.ok(isTerminal(s));
    assert.ok(isOpen('pending_review') && !isOpen('captured'));
    assert.ok(
      holdsMoney('captured') && holdsMoney('partially_refunded') && !holdsMoney('refunded'),
    );
    assert.equal(Object.keys(PAYMENT_TRANSITIONS).length, 9);
    assert.equal(refundable(Money.parse('100'), Money.parse('40')).toDbString(), '60.0000');
    assert.equal(refundable(Money.parse('100'), Money.parse('100')).toDbString(), '0.0000');
    assert.equal(statusAfterRefund(Money.parse('100'), Money.parse('40')), 'partially_refunded');
    assert.equal(statusAfterRefund(Money.parse('100'), Money.parse('100')), 'refunded');
    assert.equal(
      surchargeFor(Money.parse('200')).toDbString(),
      '0.0000',
      'no surcharge by default',
    );
    assert.equal(surchargeFor(Money.parse('200'), '2.5').toDbString(), '5.0000');
    assert.equal(surchargeFor(Money.parse('0.03'), '2.5').toDbString(), '0.0008');
  });
  await check('verification: 3DS, postal and IP country rules', () => {
    const base = {
      threeDS: null,
      givenPostalCode: 'sw1a 1aa',
      invoicePostalCode: 'SW1A-1AA',
      avsPostalCodeMatch: null,
      ipCountry: 'GB',
      invoiceCountry: 'GB',
    };
    assert.equal(assessVerification(base).outcome, 'capture');
    const threeDsDone = {
      requested: true,
      completed: true,
      authenticated: true,
      liabilityShift: true,
    };
    assert.equal(
      assessVerification({ ...base, threeDS: threeDsDone, ipCountry: 'US', givenPostalCode: '1' })
        .outcome,
      'capture',
    );
    const notDone = {
      requested: true,
      completed: false,
      authenticated: false,
      liabilityShift: null,
    };
    assert.equal(assessVerification({ ...base, threeDS: notDone }).outcome, 'capture');
    assert.equal(
      assessVerification({ ...base, threeDS: notDone, ipCountry: 'US' }).reasons.join(),
      'ip_country_mismatch',
    );
    assert.equal(
      assessVerification({ ...base, givenPostalCode: '90210' }).reasons.join(),
      'postal_code_mismatch',
    );
    assert.equal(
      assessVerification({ ...base, avsPostalCodeMatch: false }).reasons.join(),
      'postal_code_mismatch',
    );
    assert.equal(
      assessVerification({ ...base, givenPostalCode: null }).reasons.join(),
      'postal_code_missing',
    );
    assert.equal(
      assessVerification({ ...base, givenPostalCode: null, avsPostalCodeMatch: true }).outcome,
      'capture',
    );
    assert.equal(
      assessVerification({ ...base, ipCountry: null }).reasons.join(),
      'ip_country_unknown',
    );
    const noInvoiceData = assessVerification({
      ...base,
      invoicePostalCode: null,
      invoiceCountry: null,
    });
    assert.equal(noInvoiceData.outcome, 'review');
    assert.ok(noInvoiceData.reasons.includes('invoice_data_missing'));
    assert.equal(
      assessVerification({ ...base, givenPostalCode: '90210', ipCountry: 'US' }).reasons.length,
      2,
    );
    assert.equal(normalizePostal(' sw1a-1aa '), 'SW1A1AA');
    assert.equal(postalMatches('', 'x'), null);
    assert.equal(threeDSPolicyFor(fake), 'preferred');
    assert.equal(
      threeDSPolicyFor({ ...fake, capabilities: { ...fake.capabilities, supportsThreeDS: false } }),
      'disabled',
    );
    assert.equal(reviewHoldHours('stripe'), 72);
    const now = new Date('2026-01-01T00:00:00Z');
    assert.equal(reviewHoldUntil('stripe', now).toISOString(), '2026-01-04T00:00:00.000Z');
  });
  await check('payment input schemas are strict and carry no amount', () => {
    const ok = {
      invoiceId: '0190b2f1-7c3a-7d2e-8f00-123456789abc',
      idempotencyKey: 'pay-key-00001',
      paymentToken: 'tok_12345',
      billingPostalCode: null,
      payerIp: '203.0.113.9',
      returnUrl: 'https://app.example.com/pay/done',
    };
    assert.ok(createPaymentSchema.safeParse(ok).success);
    assert.ok(
      !createPaymentSchema.safeParse({ ...ok, amount: '1.00' }).success,
      'the browser cannot send an amount',
    );
    assert.ok(!createPaymentSchema.safeParse({ ...ok, idempotencyKey: 'short' }).success);
    assert.ok(!createPaymentSchema.safeParse({ ...ok, returnUrl: 'javascript:alert(1)' }).success);
    assert.ok(refundBodySchema.safeParse({ paymentId: ok.invoiceId, amount: '10.50' }).success);
    assert.ok(!refundBodySchema.safeParse({ paymentId: ok.invoiceId, amount: '-1' }).success);
    assert.ok(!refundBodySchema.safeParse({ paymentId: ok.invoiceId, amount: '1.00001' }).success);
  });
  await check('review decision: a void needs a note, unknown fields refused', () => {
    assert.ok(reviewDecisionSchema.safeParse({ decision: 'capture' }).success);
    assert.ok(!reviewDecisionSchema.safeParse({ decision: 'void' }).success);
    assert.ok(
      reviewDecisionSchema.safeParse({ decision: 'void', note: 'Looks stolen', blockCard: true })
        .success,
    );
    assert.ok(!reviewDecisionSchema.safeParse({ decision: 'void', note: 'no' }).success);
    assert.ok(!reviewDecisionSchema.safeParse({ decision: 'refund', note: 'abc' }).success);
    assert.ok(!reviewDecisionSchema.safeParse({ decision: 'capture', extra: 1 }).success);
  });
  await check('csp: only https processor origins, nothing from the forbidden list', () => {
    for (const origin of paymentPageOrigins()) assert.match(origin, /^https:\/\//);
    assert.deepEqual(violatesPaymentProfile(paymentPageOrigins()), []);
    assert.deepEqual(
      violatesPaymentProfile(['https://www.google-analytics.com', 'https://js.example.com']),
      ['https://www.google-analytics.com'],
    );
    assert.deepEqual(violatesPaymentProfile(['https://static.hotjar.com']), [
      'https://static.hotjar.com',
    ]);
    assert.ok(FORBIDDEN_PAYMENT_PAGE_HOSTS.length >= 8);
    assert.deepEqual(
      originsOf('stripe').filter((o) => !o.startsWith('https://')),
      [],
    );
  });
  await check('report math: percent text uses integers only', () => {
    assert.equal(percentText(1n, 3n), '33.3');
    assert.equal(percentText(985n, 1000n), '98.5');
    assert.equal(percentText(0n, 5n), '0.0');
    assert.equal(percentText(0n, 0n), null);
    assert.equal(percentText(5n, 5n), '100.0');
  });
  await check('payment link schemas', () => {
    const id = '0190b2f1-7c3a-7d2e-8f00-123456789abc';
    assert.ok(linkCreateSchema.safeParse({ invoiceId: id }).success);
    assert.ok(
      linkCreateSchema.safeParse({ invoiceId: id, amount: '10.5', validHours: 24 }).success,
    );
    assert.ok(!linkCreateSchema.safeParse({ invoiceId: id, validHours: 721 }).success);
    assert.ok(!linkCreateSchema.safeParse({ invoiceId: id, amount: '0.00001' }).success);
    assert.ok(!linkCreateSchema.safeParse({ invoiceId: id, token: 'x' }).success);
    assert.ok(tokenParam.safeParse({ token: 'a'.repeat(32) }).success);
    assert.ok(!tokenParam.safeParse({ token: '../etc/passwd' }).success);
    assert.ok(!tokenParam.safeParse({ token: 'short' }).success);
    assert.ok(
      linkPayBodySchema.safeParse({
        paymentToken: 'tok_1234',
        returnUrl: 'https://app.example.com/pay/x',
      }).success,
    );
    assert.ok(
      !linkPayBodySchema.safeParse({ paymentToken: 'tok_1234', returnUrl: 'data:text/html,x' })
        .success,
    );
  });
  process.stdout.write(`step10-core: ${checks} checks passed\n`);
}

main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`);
  process.exit(1);
});
