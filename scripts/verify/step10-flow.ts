// path: scripts/verify/step10-flow.ts
// Flow check of the payment core with a fake processor and an in-memory database (no network, no real database).
// Run: npx tsx --conditions=react-server scripts/verify/step10-flow.ts
import { db } from './step10-flow-setup';
import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { registerService } from '@/lib/container';
import {
  ConflictError,
  IdempotencyConflictError,
  NetworkBlockedError,
  ValidationError,
} from '@/lib/errors';
import { buildTransaction, defineAdapter } from '@/lib/payment/adapters/base';
import { registerAdapterForVerification } from '@/lib/payment/registry';
import { sealCredentials } from '@/lib/payment/credentials';
import { Money } from '@/lib/utils/currency';
import {
  startPayment,
  captureHeld,
  resumePayment,
  voidAuthorized,
  settleOrphans,
  expireStaleOpen,
} from '@/services/payment/payments';
import { getRow } from '@/services/payment/payment-store';
import { refundPayment, decideRefund } from '@/services/payment/refunds';
import { decideReview, expireReviews } from '@/services/payment/reviews';
import { receiveWebhook, retryDueWebhooks } from '@/services/payment/webhook-core';
import {
  createPaymentLink,
  checkoutFor,
  payViaLink,
  revokePaymentLink,
} from '@/services/payment/links';
import type {
  Actor,
  AdapterContext,
  AuthorizeInput,
  CardIdentity,
  CreatePaymentInput,
  DeclineCategory,
  InvoiceForPayment,
  NormalizedWebhookEvent,
  ProcessorAdapter,
  ProcessorTransaction,
  ThreeDSResult,
  WebhookRequest,
} from '@/types/contracts';

// ---------- test doubles ----------
const key = randomBytes(32);
registerService('encryption', {
  async encrypt(_p, plaintext, scope) {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', key, iv);
    c.setAAD(Buffer.from(scope ?? ''));
    const ct = Buffer.concat([
      c.update(typeof plaintext === 'string' ? Buffer.from(plaintext) : Buffer.from(plaintext)),
      c.final(),
    ]);
    return {
      ciphertext: ct.toString('base64'),
      iv: iv.toString('base64'),
      tag: c.getAuthTag().toString('base64'),
      keyVersion: 1,
    };
  },
  async decrypt(_p, payload, scope) {
    const d = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'), {
      authTagLength: 16,
    });
    d.setAAD(Buffer.from(scope ?? ''));
    d.setAuthTag(Buffer.from(payload.tag, 'base64'));
    return new Uint8Array(
      Buffer.concat([d.update(Buffer.from(payload.ciphertext, 'base64')), d.final()]),
    );
  },
});

const securityEvents: { type: string; details: Record<string, unknown> }[] = [];
const net = { allowed: true, country: 'US' as string | null };
registerService('security', {
  rateLimit: async () => ({ allowed: true, remaining: 10, retryAfterSeconds: 0 }),
  verifyTurnstile: async () => true,
  checkNetwork: async () => ({
    vpn: !net.allowed,
    proxy: false,
    tor: false,
    datacenter: false,
    countryCode: net.country,
    score: 0,
    allowed: net.allowed,
    reason: net.allowed ? null : 'vpn',
  }),
  riskScore: async () => 0,
  raiseSecurityEvent: async (type, details) => {
    securityEvents.push({ type, details });
  },
  sanitize: <T>(v: T) => v,
});
const audits: { action: string; metadata?: Record<string, unknown> }[] = [];
registerService('audit', {
  record: async (e) =>
    void audits.push({ action: e.action, ...(e.metadata ? { metadata: e.metadata } : {}) }),
  verifyChain: async () => ({
    ok: true,
    checkedFrom: '',
    checkedTo: '',
    firstBrokenSequence: null,
    gaps: [],
  }),
});
const events: { name: string; payload: Record<string, unknown> }[] = [];
registerService('events', {
  publish: async (e) => void events.push({ name: e.name, payload: e.payload }),
});

const company = randomUUID();
const owner: Actor = {
  userId: randomUUID(),
  role: 'owner',
  subRole: null,
  companyId: company,
  email: 'o@example.com',
  sessionId: 's',
  impersonatedBy: null,
  authenticatedAt: new Date().toISOString(),
  lastStepUpAt: null,
  mfaVerified: true,
};
const staff: Actor = { ...owner, userId: randomUUID(), role: 'staff' };
const reviewer: Actor = {
  ...owner,
  userId: randomUUID(),
  role: 'admin_staff',
  subRole: 'payment_processor',
  companyId: null,
};
let current: Actor = owner;
registerService('auth', {
  getActor: async () => current,
  requireRole: async () => current,
  requireStepUp: async () => undefined,
  lockState: async () => ({ locked: false, until: null }),
} as never);
registerService('permissions', { can: async () => true, requireApproval: async () => 'L0' });
const approvals = new Map<string, { status: string; action: string }>();
registerService('approval', {
  request: async (i) => {
    const requestId = randomUUID();
    approvals.set(requestId, { status: 'pending', action: i.action });
    return { requestId, status: 'pending', requiredLevel: 'L1', currentLevel: 'L1' };
  },
  decide: async (id, d) => {
    const cur = approvals.get(id);
    assert.ok(cur);
    cur.status = d.decision === 'approve' ? 'approved' : 'rejected';
    return {
      requestId: id,
      status: cur.status as 'approved' | 'rejected',
      requiredLevel: 'L1',
      currentLevel: 'L1',
    };
  },
  status: async (id) => ({
    requestId: id,
    status: (approvals.get(id)?.status ?? 'pending') as 'pending',
    requiredLevel: 'L1',
    currentLevel: 'L1',
  }),
});
const tokenStore = new Map<
  string,
  { id: string; docId: string; companyId: string; revoked: boolean; expires: number }
>();
registerService('tokens', {
  issue: async (i) => {
    const token = `tok${randomBytes(24).toString('base64url')}`;
    const id = randomUUID();
    tokenStore.set(token, {
      id,
      docId: i.docId,
      companyId: i.companyId,
      revoked: false,
      expires: Date.now() + i.ttlDays * 86_400_000,
    });
    return { id, token, expiresAt: new Date(Date.now() + i.ttlDays * 86_400_000).toISOString() };
  },
  verify: async (t) => {
    const e = tokenStore.get(t);
    if (!e) return { valid: false, reason: 'invalid' };
    if (e.revoked) return { valid: false, reason: 'revoked' };
    if (e.expires < Date.now()) return { valid: false, reason: 'expired' };
    return {
      valid: true,
      id: e.id,
      docType: 'payment',
      docId: e.docId,
      companyId: e.companyId,
      otpRequired: false,
    };
  },
  revoke: async (id) => {
    for (const e of tokenStore.values()) if (e.id === id) e.revoked = true;
  },
  reissue: async () => {
    throw new Error('unused');
  },
  sendOtp: async () => undefined,
  verifyOtp: async () => true,
});

const invoiceState = new Map<string, InvoiceForPayment>();
const applied: { invoiceId: string; paymentId: string; amount: string }[] = [];
const disputed: string[] = [];
registerService('invoices', {
  createForOrder: async () => {
    throw new Error('unused');
  },
  voidForOrder: async () => {
    throw new Error('unused');
  },
  getForPayment: async (id) => {
    const inv = invoiceState.get(id);
    assert.ok(inv, 'unknown invoice');
    return inv;
  },
  applyPayment: async ({ invoiceId, paymentId, amount }) => {
    if (!applied.some((a) => a.paymentId === paymentId)) {
      applied.push({ invoiceId, paymentId, amount: amount.toDbString() });
      const inv = invoiceState.get(invoiceId);
      if (inv) invoiceState.set(invoiceId, { ...inv, amountDue: inv.amountDue.sub(amount) });
    }
    return { status: 'paid' };
  },
  markDisputed: async (id) => void disputed.push(id),
  snapshot: async () => ({ fileId: randomUUID(), contentHash: 'x' }),
});

db.seed('companies', { id: company, name: 'Acme Ltd', plan_key: 'pro' });
function newInvoice(due = '100', over: Partial<InvoiceForPayment> = {}): InvoiceForPayment {
  const inv: InvoiceForPayment = {
    invoiceId: randomUUID(),
    companyId: company,
    clientId: randomUUID(),
    invoiceNumber: `INV-${invoiceState.size + 1}`,
    status: 'sent',
    amountDue: Money.parse(due),
    currency: 'USD',
    billingPostalCode: '10001',
    billingCountry: 'US',
    version: 1,
    ...over,
  };
  invoiceState.set(inv.invoiceId, inv);
  return inv;
}

// kd_card_stats (same rules as the SQL function)
db.rpcs.set('kd_card_stats', (a) => {
  const attempts = db.rows('payment_attempts');
  const now = Date.now();
  const within = (r: Record<string, unknown>, h: unknown): boolean =>
    now - new Date(String(r.created_at)).getTime() <= Number(h) * 3_600_000;
  const id = a.p_identity as string | null;
  const ip = a.p_ip as string;
  const cardAttempts = attempts.filter(
    (r) =>
      id &&
      r.card_identity_id === id &&
      ['authorize', 'charge'].includes(String(r.action)) &&
      within(r, a.p_velocity_hours),
  );
  return [
    {
      counted_failures: attempts.filter(
        (r) => id && r.card_identity_id === id && r.counted_failure && within(r, a.p_fail_hours),
      ).length,
      card_attempts: cardAttempts.length,
      ip_attempts: attempts.filter(
        (r) =>
          r.payer_ip === ip &&
          ['authorize', 'charge'].includes(String(r.action)) &&
          within(r, a.p_velocity_hours),
      ).length,
      ip_distinct_cards: new Set(
        attempts
          .filter(
            (r) =>
              r.payer_ip === ip &&
              r.card_identity_id &&
              r.card_identity_id !== id &&
              within(r, a.p_velocity_hours),
          )
          .map((r) => r.card_identity_id),
      ).size,
      paid_same_invoice: db
        .rows('payments')
        .filter(
          (p) =>
            id &&
            p.card_identity_id === id &&
            p.invoice_id === a.p_invoice &&
            ['captured', 'authorized', 'partially_refunded', 'refunded'].includes(
              String(p.status),
            ) &&
            within(p, a.p_same_invoice_hours),
        ).length,
    },
  ];
});

// ---------- fake processors ----------
interface Script {
  authorize: (
    input: AuthorizeInput,
    ctx: AdapterContext,
  ) => ProcessorTransaction | Promise<ProcessorTransaction>;
  calls: string[];
  webhookValid: boolean;
}
const script: Script = {
  authorize: () => assert.fail('unscripted authorize'),
  calls: [],
  webhookValid: true,
};
const threeDsDone: ThreeDSResult = {
  requested: true,
  completed: true,
  authenticated: true,
  liabilityShift: true,
};

function tx(
  status: ProcessorTransaction['status'],
  amount: Money,
  extra: Partial<ProcessorTransaction> = {},
): ProcessorTransaction {
  return buildTransaction({
    status,
    amount,
    processorTransactionId: status === 'declined' ? null : `txn_${randomUUID().slice(0, 8)}`,
    ...extra,
  });
}
let lastTxn = '';
function baseAdapter(id: 'stripe' | 'nmi', authCapture: boolean): ProcessorAdapter {
  return defineAdapter({
    id,
    displayName: `Fake ${id}`,
    capabilities: {
      supportsAuthCapture: authCapture,
      supportsThreeDS: authCapture,
      supportsRefund: true,
      supportsPartialRefund: true,
      supportsRecurring: false,
      supportsPayout: false,
      isMerchantOfRecord: false,
      modes: [{ id: 'default', label: 'Default', isDefault: true }],
      currencies: ['USD'],
    },
    credentialFields: [{ key: 'secretKey', label: 'Secret key', secret: true, required: true }],
    testConnection: async () => ({ ok: true, message: 'ok' }),
    createCheckoutSession: async () => ({
      clientConfig: { publicKey: 'pk_test_1' },
      expiresAt: null,
    }),
    authorize: async (ctx, input) => {
      script.calls.push(`authorize:${input.idempotencyKey.split(':')[1]}`);
      const result = await script.authorize(input, ctx);
      lastTxn = result.processorTransactionId ?? lastTxn;
      return result;
    },
    capture: async (_c, input) => {
      script.calls.push('capture');
      return tx('captured', input.amount, { processorTransactionId: input.processorTransactionId });
    },
    voidAuthorization: async (_c, input) => {
      script.calls.push('void');
      return tx('voided', Money.zero(), { processorTransactionId: input.processorTransactionId });
    },
    charge: authCapture
      ? undefined
      : async (ctx, input) => {
          script.calls.push('charge');
          const result = await script.authorize(input, ctx);
          return result;
        },
    refund: async (_c, input) => {
      script.calls.push('refund');
      return tx('refunded', input.amount, {
        processorTransactionId: `re_${randomUUID().slice(0, 6)}`,
      });
    },
    getTransaction: async (_c, txnId) => {
      script.calls.push('getTransaction');
      return tx('authorized', Money.parse('100'), {
        processorTransactionId: txnId,
        threeDS: threeDsDone,
        cardIdentity: { type: 'fingerprint', value: 'fp_resume' },
      });
    },
    verifyWebhook: async () => script.webhookValid,
    parseWebhook: (req: WebhookRequest): NormalizedWebhookEvent => {
      const body = JSON.parse(req.rawBody) as {
        id: string;
        type: NormalizedWebhookEvent['type'];
        txn: string | null;
        outcome?: string;
      };
      return {
        processorId: id,
        eventId: body.id,
        type: body.type,
        processorTransactionId: body.txn,
        occurredAt: new Date().toISOString(),
        payload: { outcome: body.outcome ?? null },
      };
    },
    cardIdentity: (t) => t.cardIdentity,
    mapDecline: () => 'other',
  });
}
registerAdapterForVerification(baseAdapter('stripe', true));
registerAdapterForVerification(baseAdapter('nmi', false));

async function seedProcessor(id: 'stripe' | 'nmi', enabled = true): Promise<void> {
  db.seed('processors', {
    processor_id: id,
    enabled,
    environment: 'sandbox',
    active_mode: 'default',
    credentials_version: 1,
    last_test_ok: true,
  });
  const adapter = baseAdapter(id, id === 'stripe');
  const sealed = await sealCredentials(adapter, { secretKey: 'sk_test_SUPERSECRETVALUE123' });
  db.seed('processor_credentials', {
    processor_id: id,
    credentials_version: 1,
    ciphertext: sealed.payload.ciphertext,
    iv: sealed.payload.iv,
    tag: sealed.payload.tag,
    key_version: 1,
    is_current: true,
    field_keys: sealed.fieldKeys,
    last_chars: sealed.lastChars,
  });
}
function seedRule(
  processor: 'stripe' | 'nmi',
  priority = 10,
  over: Record<string, unknown> = {},
): void {
  db.seed('routing_rules', {
    name: `rule ${priority}`,
    priority,
    processor_id: processor,
    min_amount: null,
    max_amount: null,
    countries: [],
    methods: [],
    plans: [],
    enabled: true,
    ...over,
  });
}

let counter = 0;
function input(inv: InvoiceForPayment, over: Partial<CreatePaymentInput> = {}): CreatePaymentInput {
  counter += 1;
  return {
    invoiceId: inv.invoiceId,
    idempotencyKey: `flow-key-${String(counter).padStart(6, '0')}`,
    paymentToken: 'tok_single_use_1',
    billingPostalCode: '10001',
    payerIp: `203.0.113.${(counter % 200) + 1}`,
    returnUrl: 'https://app.example.com/pay/done',
    ...over,
  };
}
const fp = (v: string): CardIdentity => ({ type: 'fingerprint', value: v });
const authorizedWith = (
  amount: Money,
  card: string,
  over: Partial<ProcessorTransaction> = {},
): ProcessorTransaction =>
  tx('authorized', amount, { cardIdentity: fp(card), avsPostalCodeMatch: true, ...over });
function declined(category: DeclineCategory, card: string): ProcessorTransaction {
  return tx('declined', Money.parse('1'), {
    declineCategory: category,
    cardIdentity: fp(card),
    rawCode: 'x',
  });
}
const callsOf = (): string => script.calls.join(',');
function reset(): void {
  script.calls.length = 0;
  securityEvents.length = 0;
  events.length = 0;
  net.allowed = true;
  net.country = 'US';
  script.webhookValid = true;
  current = owner;
}
const rowsOf = (t: string): Record<string, unknown>[] => db.rows(t);

let checks = 0;
async function check(name: string, fn: () => Promise<void>): Promise<void> {
  reset();
  try {
    await fn();
    checks += 1;
  } catch (e) {
    process.stderr.write(`FAIL ${name}\n`);
    throw e;
  }
}

// capture log output to prove no secret reaches it
const logged: string[] = [];
const realOut = process.stdout.write.bind(process.stdout);
const realErr = process.stderr.write.bind(process.stderr);
process.stdout.write = ((chunk: string | Uint8Array): boolean => {
  logged.push(String(chunk));
  return true;
}) as typeof process.stdout.write;
process.stderr.write = ((chunk: string | Uint8Array): boolean => {
  logged.push(String(chunk));
  return realErr(chunk);
}) as typeof process.stderr.write;

async function main(): Promise<void> {
  await check('routing: no rule -> routing_no_match, no processor call', async () => {
    await seedProcessor('stripe');
    const inv = newInvoice('100');
    const result = await startPayment(input(inv));
    assert.equal(result.status, 'failed');
    assert.equal(result.failureReason, 'routing_no_match');
    assert.equal(callsOf(), '');
    assert.ok(events.some((e) => e.name === 'payment.failed'));
  });

  await check(
    'routing: rule points at a disabled processor -> processor_unavailable, no failover',
    async () => {
      seedRule('nmi', 5);
      await seedProcessor('nmi', false);
      seedRule('stripe', 50);
      const inv = newInvoice('100');
      const result = await startPayment(input(inv));
      assert.equal(result.failureReason, 'processor_unavailable');
      assert.equal(callsOf(), '', 'the later rule must not be used');
      // clean up for the next scenarios
      for (const t of ['routing_rules', 'processors', 'processor_credentials'])
        rowsOf(t).length = 0;
      await seedProcessor('stripe');
      seedRule('stripe', 10);
    },
  );

  await check(
    'happy path: authorize, verify, capture, allocate, invoice updated once',
    async () => {
      const inv = newInvoice('100');
      script.authorize = (i) => authorizedWith(i.amount, 'card-happy');
      const result = await startPayment(input(inv));
      assert.equal(result.status, 'captured');
      assert.equal(callsOf(), 'authorize:authorize,capture');
      assert.equal(applied.filter((a) => a.invoiceId === inv.invoiceId).length, 1);
      assert.equal(applied.find((a) => a.invoiceId === inv.invoiceId)?.amount, '100.0000');
      assert.equal(
        rowsOf('payment_allocations').filter((a) => a.invoice_id === inv.invoiceId).length,
        1,
      );
      assert.deepEqual(
        events.map((e) => e.name),
        ['payment.authorized', 'payment.captured'],
      );
      const row = await getRow(company, result.id);
      assert.equal(row.captured_amount, '100.0000');
      // the stored identity is an HMAC, never the processor value
      assert.ok(
        rowsOf('card_identities').every(
          (r) =>
            /^[0-9a-f]{64}$/.test(String(r.identity_hmac)) &&
            !String(r.identity_hmac).includes('card-happy'),
        ),
      );
    },
  );

  await check(
    'idempotency: same key replays, other invoice with the same key is a conflict',
    async () => {
      const inv = newInvoice('100');
      script.authorize = (i) => authorizedWith(i.amount, 'card-idem');
      const first = input(inv);
      const a = await startPayment(first);
      const b = await startPayment(first);
      assert.equal(a.id, b.id);
      assert.equal(
        script.calls.filter((c) => c.startsWith('authorize')).length,
        1,
        'one processor call only',
      );
      const other = newInvoice('50');
      await assert.rejects(
        () => startPayment({ ...first, invoiceId: other.invoiceId }),
        IdempotencyConflictError,
      );
    },
  );

  await check('amount comes from the invoice, not from the caller', async () => {
    const inv = newInvoice('42.5');
    let seen = '';
    script.authorize = (i) => {
      seen = i.amount.toDbString();
      return authorizedWith(i.amount, 'card-amount');
    };
    await startPayment({ ...input(inv), amount: '1.00' } as unknown as CreatePaymentInput).then(
      () => assert.fail('extra field must be refused'),
      (e) => assert.ok(e instanceof Error),
    );
    await startPayment(input(inv));
    assert.equal(seen, '42.5000');
  });

  await check('verification: postal mismatch without 3DS -> review, nothing captured', async () => {
    const inv = newInvoice('80');
    script.authorize = (i) => authorizedWith(i.amount, 'card-pm', { avsPostalCodeMatch: null });
    const result = await startPayment(input(inv, { billingPostalCode: '99999' }));
    assert.equal(result.status, 'pending_review');
    assert.equal(callsOf(), 'authorize:authorize', 'no capture');
    assert.equal(applied.filter((a) => a.invoiceId === inv.invoiceId).length, 0);
    const review = rowsOf('payment_reviews').find((r) => r.payment_id === result.id);
    assert.ok(review && (review.reasons as string[]).includes('postal_code_mismatch'));
    assert.ok(new Date(String(review.hold_until)).getTime() - Date.now() <= 72 * 3_600_000 + 5000);
    assert.ok(events.some((e) => e.name === 'payment.pending_review'));
    // a reviewer captures it
    current = reviewer;
    const done = await decideReview(reviewer, String(review.id), {
      decision: 'capture',
      note: null,
      blockCard: false,
    });
    assert.equal(done.status, 'captured');
    assert.equal(applied.filter((a) => a.invoiceId === inv.invoiceId).length, 1);
    assert.ok(audits.some((a) => a.action === 'payment.review.capture'));
    await assert.rejects(
      () =>
        decideReview(reviewer, String(review.id), {
          decision: 'void',
          note: 'late',
          blockCard: false,
        }),
      ConflictError,
    );
  });

  await check(
    'verification: IP country mismatch without 3DS -> review; void blocks the card when asked',
    async () => {
      const inv = newInvoice('60');
      net.country = 'BD';
      script.authorize = (i) => authorizedWith(i.amount, 'card-geo');
      const result = await startPayment(input(inv));
      assert.equal(result.status, 'pending_review');
      const review = rowsOf('payment_reviews').find((r) => r.payment_id === result.id);
      assert.ok(review && (review.reasons as string[]).includes('ip_country_mismatch'));
      current = reviewer;
      const voided = await decideReview(reviewer, String(review.id), {
        decision: 'void',
        note: 'Looks stolen',
        blockCard: true,
      });
      assert.equal(voided.status, 'voided');
      assert.ok(script.calls.includes('void'));
      assert.equal(rowsOf('card_blacklist').length >= 1, true);
    },
  );

  await check('verification: completed 3DS skips the postal and country comparison', async () => {
    const inv = newInvoice('70');
    net.country = 'BD';
    script.authorize = (i) => authorizedWith(i.amount, 'card-3ds', { threeDS: threeDsDone });
    const result = await startPayment(input(inv, { billingPostalCode: null }));
    assert.equal(result.status, 'captured');
  });

  await check('review hold expires: authorization voided, review marked expired', async () => {
    const inv = newInvoice('55');
    script.authorize = (i) => authorizedWith(i.amount, 'card-exp', { avsPostalCodeMatch: false });
    const result = await startPayment(input(inv));
    assert.equal(result.status, 'pending_review');
    const review = rowsOf('payment_reviews').find((r) => r.payment_id === result.id);
    assert.ok(review);
    review.hold_until = new Date(Date.now() - 1000).toISOString();
    assert.equal(await expireReviews(10), 1);
    assert.equal((await getRow(company, result.id)).status, 'voided');
    assert.equal(review.status, 'expired');
    assert.ok(script.calls.includes('void'));
  });

  await check('card rule: same card cannot pay the same invoice again (24 h)', async () => {
    const inv = newInvoice('100');
    script.authorize = (i) => authorizedWith(i.amount, 'card-same');
    const first = await startPayment(input(inv), { amount: Money.parse('40') });
    assert.equal(first.status, 'captured');
    script.calls.length = 0;
    const second = await startPayment(input(inv), { amount: Money.parse('30') });
    assert.equal(second.status, 'failed');
    assert.equal(second.failureReason, 'same_card_same_invoice');
    assert.ok(script.calls.includes('void'), 'the new authorization is given back');
    // another card, or another invoice, is fine
    script.authorize = (i) => authorizedWith(i.amount, 'card-other');
    assert.equal(
      (await startPayment(input(inv), { amount: Money.parse('30') })).status,
      'captured',
    );
    const inv2 = newInvoice('10');
    script.authorize = (i) => authorizedWith(i.amount, 'card-same');
    assert.equal((await startPayment(input(inv2))).status, 'captured');
  });

  await check(
    'card rule: third counted failure is refused; insufficient funds is not counted',
    async () => {
      const inv = newInvoice('100');
      script.authorize = () => declined('invalid_cvv', 'card-fail');
      const p1 = await startPayment(input(inv));
      assert.equal(p1.status, 'failed');
      const p2 = await startPayment(input(inv));
      assert.equal(p2.status, 'failed');
      script.authorize = (i) => authorizedWith(i.amount, 'card-fail');
      script.calls.length = 0;
      const p3 = await startPayment(input(inv));
      assert.equal(p3.status, 'failed');
      assert.equal(p3.failureReason, 'card_fail_limit');
      // insufficient funds three times, then success
      script.authorize = () => declined('insufficient_funds', 'card-poor');
      for (let i = 0; i < 3; i += 1)
        assert.equal((await startPayment(input(inv))).status, 'failed');
      script.authorize = (i) => authorizedWith(i.amount, 'card-poor');
      assert.equal((await startPayment(input(inv))).status, 'captured');
    },
  );

  await check('card rule: processor fraud signal blocks the card at once', async () => {
    const inv = newInvoice('100');
    script.authorize = () => declined('processor_fraud_signal', 'card-fraud');
    assert.equal((await startPayment(input(inv))).status, 'failed');
    script.authorize = (i) => authorizedWith(i.amount, 'card-fraud');
    const next = await startPayment(input(inv));
    assert.equal(next.failureReason, 'card_blacklisted');
    assert.ok(script.calls.includes('void'));
  });

  await check(
    'open payment guard: a second payment on an invoice in progress is refused',
    async () => {
      const inv = newInvoice('100');
      script.authorize = (i) =>
        tx('requires_action', i.amount, {
          cardIdentity: fp('card-3dsflow'),
          requiredAction: { kind: 'redirect', url: 'https://bank.example/3ds', clientSecret: null },
        });
      const first = await startPayment(input(inv));
      assert.equal(first.status, 'requires_action');
      assert.equal(first.requiredAction?.url, 'https://bank.example/3ds');
      await assert.rejects(() => startPayment(input(inv)), ConflictError);
      // the payer comes back; the processor answers authorized with 3DS done -> captured
      const resumed = await resumePayment(company, first.id);
      assert.equal(resumed.status, 'captured');
    },
  );

  await check('abandoned 3DS: stale payments are failed by the upkeep job', async () => {
    const inv = newInvoice('100');
    script.authorize = (i) =>
      tx('requires_action', i.amount, {
        requiredAction: { kind: 'redirect', url: 'https://bank.example/3ds', clientSecret: null },
      });
    const first = await startPayment(input(inv));
    const row = rowsOf('payments').find((r) => r.id === first.id);
    assert.ok(row);
    row.created_at = new Date(Date.now() - 2 * 3_600_000).toISOString();
    await expireStaleOpen(10);
    const { expireAbandonedChallenges } = await import('@/services/payment/payments');
    assert.ok((await expireAbandonedChallenges(10)) >= 1);
    assert.equal((await getRow(company, first.id)).status, 'failed');
  });

  await check(
    'network: VPN/proxy blocks the payment before any record or processor call',
    async () => {
      const inv = newInvoice('100');
      net.allowed = false;
      const before = rowsOf('payments').length;
      await assert.rejects(() => startPayment(input(inv)), NetworkBlockedError);
      assert.equal(rowsOf('payments').length, before);
      assert.equal(callsOf(), '');
      assert.ok(securityEvents.some((e) => e.type === 'network_blocked'));
    },
  );

  await check('return address must belong to this application', async () => {
    const inv = newInvoice('100');
    await assert.rejects(
      () => startPayment(input(inv, { returnUrl: 'https://evil.example/steal' })),
      ValidationError,
    );
    await assert.rejects(() => startPayment(input(inv, { returnUrl: 'javascript:alert(1)' })));
  });

  await check('invoice that cannot be paid is refused', async () => {
    const paid = newInvoice('0', { status: 'paid' });
    await assert.rejects(() => startPayment(input(paid)), ValidationError);
    const draft = newInvoice('10', { status: 'draft' });
    await assert.rejects(() => startPayment(input(draft)), ValidationError);
  });

  await check('processor failure: the payment fails, nothing else is tried', async () => {
    const inv = newInvoice('100');
    script.authorize = () => {
      throw new Error('socket hang up');
    };
    const result = await startPayment(input(inv));
    assert.equal(result.status, 'failed');
    assert.equal(result.failureReason, 'processor_error');
    assert.equal(callsOf(), 'authorize:authorize');
  });

  await check(
    'single-step processor: same checks before the charge; mismatch is not charged',
    async () => {
      rowsOf('routing_rules').length = 0;
      rowsOf('processors').length = 0;
      rowsOf('processor_credentials').length = 0;
      await seedProcessor('nmi');
      seedRule('nmi', 10);
      const inv = newInvoice('100');
      script.authorize = (i) => tx('captured', i.amount, { cardIdentity: fp('card-nmi') });
      const bad = await startPayment(input(inv, { billingPostalCode: '00000' }));
      assert.equal(bad.status, 'failed');
      assert.equal(bad.failureReason, 'verification_mismatch');
      assert.equal(callsOf(), '', 'no charge was sent');
      const good = await startPayment(input(inv));
      assert.equal(good.status, 'captured');
      assert.equal(callsOf(), 'charge');
      rowsOf('routing_rules').length = 0;
      rowsOf('processors').length = 0;
      rowsOf('processor_credentials').length = 0;
      await seedProcessor('stripe');
      seedRule('stripe', 10);
    },
  );

  await check(
    'refunds: partial, over-refund refused, staff waits for approval, large needs the CEO rule',
    async () => {
      const inv = newInvoice('1000');
      script.authorize = (i) => authorizedWith(i.amount, 'card-refund');
      const paid = await startPayment(input(inv));
      assert.equal(paid.status, 'captured');
      const key1 = 'refund-key-000001';
      const part = await refundPayment(paid.id, Money.parse('100'), 'goods returned', key1);
      assert.equal(part.status, 'partially_refunded');
      assert.equal(
        (await refundPayment(paid.id, Money.parse('100'), 'goods returned', key1)).status,
        'partially_refunded',
      );
      assert.equal(
        rowsOf('refunds').filter((r) => r.payment_id === paid.id).length,
        1,
        'replay creates no second refund',
      );
      assert.equal(script.calls.filter((c) => c === 'refund').length, 1);
      await assert.rejects(
        () => refundPayment(paid.id, Money.parse('900.0001'), null, 'refund-key-000002'),
        ValidationError,
      );
      // owner, above the threshold: waits for the CEO rule
      const large = await refundPayment(paid.id, Money.parse('600'), 'large', 'refund-key-000003');
      assert.equal(large.status, 'partially_refunded', 'no change yet');
      const pending = rowsOf('refunds').find((r) => r.idempotency_key === 'refund-key-000003');
      assert.equal(pending?.status, 'pending_approval');
      assert.equal([...approvals.values()].at(-1)?.action, 'payment.refund.large');
      current = { ...owner, role: 'ceo', companyId: null, userId: randomUUID() };
      const approved = await decideRefund(current, String(pending?.id), 'approve', null);
      assert.equal(approved.status, 'partially_refunded');
      assert.equal((await getRow(company, paid.id)).refunded_amount, '700.0000');
      // staff refund waits for approval
      current = staff;
      await refundPayment(paid.id, Money.parse('50'), 'staff', 'refund-key-000004');
      assert.equal([...approvals.values()].at(-1)?.action, 'payment.refund');
      current = owner;
      const staffRefund = rowsOf('refunds').find((r) => r.idempotency_key === 'refund-key-000004');
      await decideRefund(owner, String(staffRefund?.id), 'reject', 'not needed');
      assert.equal(
        rowsOf('refunds').find((r) => r.idempotency_key === 'refund-key-000004')?.status,
        'rejected',
      );
      // rest of the money goes back -> refunded
      await refundPayment(paid.id, Money.parse('300'), null, 'refund-key-000005');
      assert.equal((await getRow(company, paid.id)).status, 'refunded');
      await assert.rejects(
        () => refundPayment(paid.id, Money.parse('1'), null, 'refund-key-000006'),
        ValidationError,
      );
    },
  );

  await check(
    'webhooks: bad signature refused and nothing stored; duplicate processed once',
    async () => {
      const inv = newInvoice('100');
      script.authorize = (i) =>
        tx('requires_action', i.amount, {
          cardIdentity: fp('card-wh'),
          requiredAction: { kind: 'sdk_challenge', url: null, clientSecret: 'cs_1' },
        });
      const pay = await startPayment(input(inv));
      const row = await getRow(company, pay.id);
      const body = JSON.stringify({
        id: 'evt_1',
        type: 'payment.authorized',
        txn: row.processor_transaction_id,
      });
      script.webhookValid = false;
      const before = rowsOf('webhook_events').length;
      assert.deepEqual(await receiveWebhook('stripe', { headers: {}, rawBody: body }), {
        kind: 'invalid_signature',
      });
      assert.equal(rowsOf('webhook_events').length, before);
      assert.ok(securityEvents.some((e) => e.type === 'webhook_signature_invalid'));
      script.webhookValid = true;
      const first = await receiveWebhook('stripe', { headers: {}, rawBody: body });
      assert.deepEqual(first, { kind: 'accepted', status: 'processed' });
      assert.equal(
        (await getRow(company, pay.id)).status,
        'captured',
        'state came from the processor answer',
      );
      const calls = script.calls.filter((c) => c === 'getTransaction').length;
      assert.deepEqual(await receiveWebhook('stripe', { headers: {}, rawBody: body }), {
        kind: 'duplicate',
      });
      assert.equal(
        script.calls.filter((c) => c === 'getTransaction').length,
        calls,
        'duplicate not processed again',
      );
      assert.deepEqual(await receiveWebhook('bkash', { headers: {}, rawBody: body }), {
        kind: 'unknown_processor',
      });
      assert.deepEqual(await receiveWebhook('adyen', { headers: {}, rawBody: body }), {
        kind: 'unknown_processor',
      });
      script.webhookValid = true;
      assert.deepEqual(
        await receiveWebhook('stripe', {
          headers: {},
          rawBody: '{"id":"","type":"payment.failed","txn":null}',
        }),
        { kind: 'bad_payload' },
      );
    },
  );

  await check(
    'webhooks: payment not found yet -> retried with delay, then dead letter; admin retry works',
    async () => {
      const body = JSON.stringify({ id: 'evt_late', type: 'payment.captured', txn: 'txn_not_yet' });
      const out = await receiveWebhook('stripe', { headers: {}, rawBody: body });
      assert.deepEqual(out, { kind: 'accepted', status: 'failed' });
      const ev = rowsOf('webhook_events').find((r) => r.event_id === 'evt_late');
      assert.ok(ev && ev.next_retry_at);
      for (let i = 0; i < 4; i += 1) {
        ev.next_retry_at = new Date(Date.now() - 1000).toISOString();
        await retryDueWebhooks(10);
      }
      assert.equal(ev.status, 'dead_letter');
      assert.equal(ev.attempts, 5);
      // the payment now exists -> a person processes the delivery again
      const inv = newInvoice('100');
      script.authorize = (i) =>
        tx('requires_action', i.amount, {
          requiredAction: { kind: 'sdk_challenge', url: null, clientSecret: 'cs' },
        });
      const pay = await startPayment(input(inv));
      const row = rowsOf('payments').find((r) => r.id === pay.id);
      assert.ok(row);
      row.processor_transaction_id = 'txn_not_yet';
      const { retryWebhookEvent } = await import('@/services/payment/webhook-core');
      assert.equal(await retryWebhookEvent(String(ev.id)), 'processed');
    },
  );

  await check('webhooks: dispute opened marks the invoice and publishes the event', async () => {
    const inv = newInvoice('100');
    script.authorize = (i) => authorizedWith(i.amount, 'card-disp');
    const pay = await startPayment(input(inv));
    const row = await getRow(company, pay.id);
    const body = JSON.stringify({
      id: 'evt_disp',
      type: 'dispute.opened',
      txn: row.processor_transaction_id,
    });
    assert.deepEqual(await receiveWebhook('stripe', { headers: {}, rawBody: body }), {
      kind: 'accepted',
      status: 'processed',
    });
    assert.ok(disputed.includes(inv.invoiceId));
    assert.ok(events.some((e) => e.name === 'dispute.opened'));
  });

  await check('payment links: create, checkout view, pay once, revoke, expiry', async () => {
    const inv = newInvoice('200');
    const link = await createPaymentLink(owner, {
      invoiceId: inv.invoiceId,
      amount: Money.parse('150'),
      validHours: 24,
    });
    assert.match(link.url, /^https:\/\/app\.example\.com\/pay\/tok/);
    const token = link.url.split('/pay/')[1] ?? '';
    const stored = rowsOf('payment_links')[rowsOf('payment_links').length - 1];
    assert.ok(
      stored &&
        /^[0-9a-f]{64}$/.test(String(stored.token_hash)) &&
        !link.url.includes(String(stored.token_hash)),
    );
    const view = await checkoutFor(token);
    assert.equal(view.amount, '150.0000');
    assert.equal(view.processorId, 'stripe');
    assert.deepEqual(view.clientConfig, { publicKey: 'pk_test_1' });
    await assert.rejects(() => checkoutFor('x'.repeat(40)));
    script.authorize = (i) => authorizedWith(i.amount, 'card-link');
    const paid = await payViaLink(token, {
      paymentToken: 'tok_abcd',
      billingPostalCode: '10001',
      returnUrl: 'https://app.example.com/pay/x',
      idempotencyKey: 'link-key-000001',
      payerIp: '203.0.113.77',
    });
    assert.equal(paid.status, 'captured');
    assert.equal(applied.find((a) => a.paymentId === paid.id)?.amount, '150.0000');
    await assert.rejects(() => checkoutFor(token), 'a used single-use link is gone');
    const link2 = await createPaymentLink(owner, {
      invoiceId: inv.invoiceId,
      amount: null,
      validHours: 1,
    });
    await revokePaymentLink(owner, link2.id);
    await assert.rejects(() => checkoutFor(link2.url.split('/pay/')[1] ?? ''));
    const link3 = await createPaymentLink(owner, {
      invoiceId: inv.invoiceId,
      amount: null,
      validHours: 1,
    });
    const row3 = rowsOf('payment_links').find((r) => r.id === link3.id);
    assert.ok(row3);
    row3.expires_at = new Date(Date.now() - 1000).toISOString();
    await assert.rejects(() => checkoutFor(link3.url.split('/pay/')[1] ?? ''));
    await assert.rejects(
      () =>
        createPaymentLink(owner, {
          invoiceId: inv.invoiceId,
          amount: Money.parse('9999'),
          validHours: 1,
        }),
      ValidationError,
    );
  });

  await check('settle job: a captured payment without allocation is finished once', async () => {
    const inv = newInvoice('100');
    script.authorize = (i) => authorizedWith(i.amount, 'card-orphan');
    const pay = await startPayment(input(inv));
    assert.equal(pay.status, 'captured');
    const idx = rowsOf('payment_allocations').findIndex((a) => a.payment_id === pay.id);
    rowsOf('payment_allocations').splice(idx, 1);
    const appliedIdx = applied.findIndex((a) => a.paymentId === pay.id);
    applied.splice(appliedIdx, 1);
    assert.ok((await settleOrphans(10)) >= 1);
    assert.equal(applied.filter((a) => a.paymentId === pay.id).length, 1);
    assert.equal((await settleOrphans(10)) >= 0, true);
    assert.equal(applied.filter((a) => a.paymentId === pay.id).length, 1, 'applied once');
  });

  await check('void and capture helpers refuse the wrong state', async () => {
    const inv = newInvoice('100');
    script.authorize = (i) => authorizedWith(i.amount, 'card-state');
    const pay = await startPayment(input(inv));
    const row = await getRow(company, pay.id);
    await assert.rejects(() => voidAuthorized(row, 'x'), ValidationError);
    await assert.rejects(() => captureHeld(row), ValidationError);
  });

  // ---------- secrets never reach logs, audit or events ----------
  process.stdout.write = realOut;
  process.stderr.write = realErr;
  const everything = JSON.stringify({
    logged,
    audits,
    events,
    securityEvents,
    attempts: rowsOf('payment_attempts'),
    reviews: rowsOf('payment_reviews'),
    webhooks: rowsOf('webhook_events'),
  });
  for (const secret of ['SUPERSECRETVALUE123', 'tok_single_use_1', 'tok_abcd']) {
    assert.ok(!everything.includes(secret), `${secret} leaked`);
  }
  assert.ok(
    !JSON.stringify(rowsOf('payments')).includes('tok_single_use_1'),
    'payment token must not be stored',
  );
  checks += 1;
  process.stdout.write(`step10-flow: ${checks} checks passed\n`);
}

main().catch((e: unknown) => {
  process.stdout.write = realOut;
  process.stderr.write = realErr;
  process.stderr.write(`${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`);
  process.exit(1);
});
