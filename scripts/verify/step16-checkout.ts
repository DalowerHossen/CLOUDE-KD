// path: scripts/verify/step16-checkout.ts
// Hosted checkout sessions: one order is one session (asking again returns it, a paid order cannot be paid again), live sessions
// need an approved KYC, a changed amount is refused, an expired session opens again with a new link, a cancelled order voids its
// unpaid invoice, and a half-made claim is taken over once. Uses the in-memory database of the STEP 10 check and fake contracts.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step16-checkout.ts
import { db } from './step10-flow-setup';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { registerService } from '@/lib/container';
import { Money } from '@/lib/utils/currency';
import { sessionInput, returnUrl, effectiveStatus, sameOrder } from '@/lib/checkout/session-rules';
import { cancelSession, createSession, getSession } from '@/services/checkout/sessions';

let checks = 0;
const check = async (name: string, fn: () => Promise<void> | void): Promise<void> => {
  try {
    await fn();
    checks += 1;
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    throw error;
  }
};

const company = randomUUID();
const owner = randomUUID();
let verified = true;
const invoices = new Map<string, { status: string }>();
const links: { id: string; revoked: boolean }[] = [];
let invoiceMade = 0;
const audits: string[] = [];
const voided: string[] = [];

registerService('encryption', {
  encrypt: async (_p: string, text: string) => ({ v: String(text) }),
  decrypt: async (_p: string, payload: { v: string }) =>
    new TextEncoder().encode(String(payload.v)),
} as never);
registerService('audit', {
  record: async (e: { action: string }) => void audits.push(e.action),
} as never);
registerService('kyc', {
  status: async () => 'approved',
  isVerified: async () => verified,
} as never);
registerService('invoices', {
  createForOrder: async () => {
    invoiceMade += 1;
    const id = randomUUID();
    invoices.set(id, { status: 'sent' });
    return { invoiceId: id, invoiceNumber: `INV-${invoiceMade}` };
  },
  voidForOrder: async ({ invoiceId }: { invoiceId: string }) => {
    voided.push(invoiceId);
    invoices.set(invoiceId, { status: 'void' });
  },
  getForPayment: async (id: string) => ({
    invoiceId: id,
    companyId: company,
    clientId: randomUUID(),
    invoiceNumber: 'INV',
    status: invoices.get(id)?.status ?? 'void',
    amountDue: Money.parse('10.00'),
    currency: 'USD',
    billingPostalCode: null,
    billingCountry: 'US',
    version: 1,
  }),
} as never);
registerService('payments', {
  createLink: async () => {
    const id = randomUUID();
    links.push({ id, revoked: false });
    return {
      linkId: id,
      url: `https://pay.example/pay/${id}`,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    };
  },
  revokeLink: async ({ linkId }: { linkId: string }) => {
    const l = links.find((x) => x.id === linkId);
    if (l) l.revoked = true;
  },
} as never);

const ctx = { companyId: company, keyId: randomUUID(), createdBy: owner, mode: 'live' as const };
const body = (over: Record<string, unknown> = {}): ReturnType<typeof sessionInput.parse> =>
  sessionInput.parse({
    order_id: 'WC-1001',
    amount: '49.90',
    customer: { name: 'Ann Lee', email: 'Ann@Example.com', country: 'US' },
    success_url: 'https://shop.example/thanks',
    cancel_url: 'https://shop.example/cart',
    ...over,
  });

(async () => {
  await check('the input is strict: bad amounts, http addresses and extra keys are refused', () => {
    for (const bad of [
      { amount: '0' },
      { amount: '10.999' },
      { amount: '-5' },
      { amount: '1e3' },
      { success_url: 'http://shop.example/x' },
      { cancel_url: 'https://user:pw@shop.example/x' },
      { order_id: 'a b' },
      { extra: 1 },
      { currency: 'EUR' },
    ])
      assert.throws(() => body(bad), JSON.stringify(bad));
    assert.equal(body().customer.email, 'ann@example.com');
  });

  await check(
    'a live key with an approved KYC makes a session, one invoice and one link',
    async () => {
      const made = await createSession(ctx, body());
      assert.equal(made.created, true);
      assert.equal(made.session.status, 'open');
      assert.equal(made.session.amount, '49.90');
      assert.match(String(made.session.checkout_url), /^https:\/\/pay\.example\/pay\//);
      assert.equal(invoiceMade, 1);
      assert.equal(links.length, 1);
      assert.ok(audits.includes('checkout.session_created'));
    },
  );

  await check(
    'asking again for the same order returns the same session and makes nothing new',
    async () => {
      const again = await createSession(ctx, body());
      assert.equal(again.created, false);
      assert.equal(invoiceMade, 1);
      assert.equal(links.length, 1);
      assert.equal(db.rows('checkout_sessions').length, 1);
    },
  );

  await check('the same order with another amount is refused', async () => {
    await assert.rejects(() => createSession(ctx, body({ amount: '50.00' })), /other details/);
    assert.equal(invoiceMade, 1);
  });

  await check('without an approved KYC, or with a sandbox key, no session is made', async () => {
    verified = false;
    await assert.rejects(() => createSession(ctx, body({ order_id: 'WC-2' })), /KYC/);
    verified = true;
    await assert.rejects(
      () => createSession({ ...ctx, mode: 'sandbox' as never }, body({ order_id: 'WC-3' })),
      /live key/,
    );
    await assert.rejects(
      () => createSession({ ...ctx, createdBy: null }, body({ order_id: 'WC-4' })),
      /no owner/,
    );
    assert.equal(db.rows('checkout_sessions').length, 1);
  });

  await check('a paid order shows as paid and cannot be asked for again', async () => {
    const row = db.rows('checkout_sessions')[0]!;
    invoices.set(String(row.invoice_id), { status: 'paid' });
    const seen = await getSession(ctx, String(row.id));
    assert.equal(seen.status, 'paid');
    assert.equal(seen.checkout_url, null);
    assert.ok(seen.paid_at);
    await assert.rejects(() => createSession(ctx, body()), /already paid/);
    await assert.rejects(() => cancelSession(ctx, String(row.id)), /already paid/);
    assert.equal(voided.length, 0);
  });

  await check('an expired session opens again with a new link for the same invoice', async () => {
    const made = await createSession(ctx, body({ order_id: 'WC-5' }));
    const row = db.rows('checkout_sessions').find((r) => r.external_ref === 'WC-5')!;
    row.expires_at = new Date(Date.now() - 1000).toISOString();
    const reopened = await createSession(ctx, body({ order_id: 'WC-5' }));
    assert.equal(reopened.session.id, made.session.id);
    assert.equal(reopened.session.status, 'open');
    assert.notEqual(reopened.session.checkout_url, made.session.checkout_url);
    assert.equal(links.filter((l) => l.revoked).length, 1);
    assert.equal(invoiceMade, 2);
  });

  await check(
    'cancelling revokes the link, voids the unpaid invoice and is repeatable',
    async () => {
      const row = db.rows('checkout_sessions').find((r) => r.external_ref === 'WC-5')!;
      const done = await cancelSession(ctx, String(row.id));
      assert.equal(done.status, 'cancelled');
      assert.equal(done.checkout_url, null);
      assert.deepEqual(voided, [String(row.invoice_id)]);
      assert.equal((await cancelSession(ctx, String(row.id))).status, 'cancelled');
      await assert.rejects(() => createSession(ctx, body({ order_id: 'WC-5' })), /cancelled/);
    },
  );

  await check(
    'a claim in progress is not taken over, a stale one is finished once without a second invoice',
    async () => {
      const claimed = db.seed('checkout_sessions', {
        company_id: company,
        external_ref: 'WC-6',
        amount: '49.9000',
        customer_name: 'Ann Lee',
        customer_email: 'ann@example.com',
        description: '',
        success_url: 'https://shop.example/thanks',
        cancel_url: 'https://shop.example/cart',
        metadata: {},
        status: 'creating',
        invoice_id: null,
      });
      await assert.rejects(() => createSession(ctx, body({ order_id: 'WC-6' })), /being prepared/);
      claimed.updated_at = new Date(Date.now() - 600_000).toISOString();
      claimed.invoice_id = randomUUID();
      invoices.set(String(claimed.invoice_id), { status: 'sent' });
      const before = invoiceMade;
      const done = await createSession(ctx, body({ order_id: 'WC-6' }));
      assert.equal(done.session.status, 'open');
      assert.equal(invoiceMade, before);
    },
  );

  await check('status and return address rules', () => {
    const future = new Date(Date.now() + 1000).toISOString();
    const past = new Date(Date.now() - 1000).toISOString();
    assert.equal(effectiveStatus('open', future, new Date()), 'open');
    assert.equal(effectiveStatus('open', past, new Date()), 'expired');
    assert.equal(effectiveStatus('paid', past, new Date()), 'paid');
    assert.equal(sameOrder({ amount: '49.9000', customer_email: 'ann@example.com' }, body()), true);
    const url = new URL(returnUrl('https://shop.example/thanks?a=1', 's1', 'WC-1', 'paid'));
    assert.equal(url.searchParams.get('a'), '1');
    assert.equal(url.searchParams.get('kd_result'), 'paid');
    assert.equal(url.searchParams.get('kd_order'), 'WC-1');
  });

  process.stdout.write(`step16-checkout: ${checks} checks passed\n`);
})().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
});
