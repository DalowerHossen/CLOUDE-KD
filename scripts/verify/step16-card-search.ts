// path: scripts/verify/step16-card-search.ts
// Find a payment by the last four digits of the card: adapters give the digits and the brand without changing the card identity,
// the input rules (four digits, window, reason), an owner sees only the own company, platform staff need the permission, a fresh
// sign-in check, a reason and are rate limited, and every search is audited without the people it showed.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step16-card-search.ts
import { db } from './step10-flow-setup';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { registerService } from '@/lib/container';
import { cardFacts, lastFourOf } from '@/lib/payment/card-facts';
import { identityHmac } from '@/lib/payment/card-rules';
import {
  addressLine,
  hostOf,
  platformSearchInput,
  resolveWindow,
  tenantSearchInput,
} from '@/lib/payment/card-search-rules';
import { cardIdentity as adyen } from '@/lib/payment/adapters/adyen/mapping';
import { cardIdentity as bluesnap } from '@/lib/payment/adapters/bluesnap/mapping';
import { cardIdentity as braintree } from '@/lib/payment/adapters/braintree/mapping';
import { cardIdentity as square } from '@/lib/payment/adapters/square/mapping';
import { cardIdentity as paddle } from '@/lib/payment/adapters/paddle/mapping';
import { cardIdentity as paypal } from '@/lib/payment/adapters/paypal/mapping';
import { cardIdentity as verifone } from '@/lib/payment/adapters/verifone/mapping';
import { searchAllPayments, searchOwnPayments } from '@/services/payment/card-search';
import type { Actor } from '@/types/contracts';

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

const audits: { action: string; metadata?: Record<string, unknown> }[] = [];
let stepUpFresh = true;
let allowed = true;
let rateOk = true;
registerService('audit', {
  record: async (e: { action: string; metadata?: Record<string, unknown> }) => void audits.push(e),
} as never);
registerService('permissions', { can: async () => allowed } as never);
registerService('auth', {
  requireStepUp: async () => {
    if (!stepUpFresh) throw new Error('step-up needed');
  },
} as never);
registerService('security', {
  rateLimit: async () => ({ allowed: rateOk, retryAfterSeconds: 30 }),
} as never);

const company = randomUUID();
const other = randomUUID();
const actor = (over: Partial<Actor>): Actor => ({
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
  ...over,
});

function pay(
  companyId: string,
  last4: string,
  brand: string,
  amount: string,
  days: number,
  status = 'captured',
): string {
  const invoiceId = randomUUID();
  const at = new Date(Date.now() - days * 86_400_000).toISOString();
  db.seed('invoices', {
    id: invoiceId,
    company_id: companyId,
    number: `INV-${last4}`,
    bill_to: {
      name: 'Ann Lee',
      email: 'ann@example.com',
      phone: '+1 555 0100',
      line1: '1 Main St',
      city: 'Austin',
      region: 'TX',
      postalCode: '73301',
      country: 'US',
    },
  });
  const row = db.seed('payments', {
    company_id: companyId,
    invoice_id: invoiceId,
    amount,
    status,
    card_last4: last4,
    card_brand: brand,
    payer_country: 'US',
    captured_at: at,
    created_at: at,
    idempotency_key: randomUUID(),
  });
  return String(row.id);
}

(async () => {
  await check('card facts keep four digits and a clean brand only', () => {
    assert.deepEqual(cardFacts('4242', ' VISA '), { last4: '4242', brand: 'visa' });
    assert.deepEqual(cardFacts('42424242', '<b>x'), { brand: 'bx' });
    assert.deepEqual(cardFacts(null, null), {});
    assert.equal(lastFourOf('XXXX4242'), '4242');
    assert.equal(lastFourOf('424'), null);
  });

  await check('adapters add the digits and the brand without changing the card identity', () => {
    const cases: [string, ReturnType<typeof adyen>][] = [
      [
        'adyen',
        adyen(
          { additionalData: { cardSummary: '1111', cardBin: '411111', expiryDate: '3/2030' } },
          { paymentMethod: { brand: 'visa' } },
        ),
      ],
      ['bluesnap', bluesnap({ binNumber: '411111', cardLastFourDigits: '1111', cardType: 'VISA' })],
      [
        'braintree-uid',
        braintree({ uniqueNumberIdentifier: 'abc', last4: '1111', brandCode: 'VISA' }),
      ],
      [
        'braintree',
        braintree({
          last4: '1111',
          bin: '411111',
          expirationMonth: '3',
          expirationYear: '2030',
          brandCode: 'VISA',
        }),
      ],
      ['square-fp', square({ fingerprint: 'fp', last_4: '1111', card_brand: 'VISA' })],
      [
        'paddle',
        paddle({
          method_details: {
            card: { last4: '1111', expiry_month: 3, expiry_year: 2030, type: 'visa' },
          },
        }),
      ],
      ['paypal', paypal({ last_digits: '1111', brand: 'VISA', bin_details: { bin: '411111' } })],
      ['verifone', verifone(null, '411111******1111', 'VISA')],
      ['verifone-token', verifone('tok_1', '411111******1111', 'VISA')],
    ];
    for (const [name, id] of cases) {
      assert.ok(id, name);
      assert.equal(id.last4, '1111', name);
      assert.equal(id.brand, 'visa', name);
      const { last4: _l, brand: _b, ...bare } = id;
      const key = 'secret'.padEnd(32, 'x');
      assert.equal(
        identityHmac(key, 'stripe', id),
        identityHmac(key, 'stripe', bare),
        `${name} identity unchanged`,
      );
      assert.match(identityHmac(key, 'stripe', id), /^[0-9a-f]{64}$/);
    }
  });

  await check('the search input: four digits, a window, a reason for staff, strict keys', () => {
    assert.ok(tenantSearchInput.safeParse({ last4: '4242' }).success);
    for (const bad of [
      { last4: '424' },
      { last4: '42424' },
      { last4: 'abcd' },
      { last4: '4242', extra: 1 },
      { last4: '4242', from: '2020-01-01', to: '2024-01-01' },
      { last4: '4242', amountMin: '9', amountMax: '1' },
    ])
      assert.ok(!tenantSearchInput.safeParse(bad).success, JSON.stringify(bad));
    assert.ok(!platformSearchInput.safeParse({ last4: '4242' }).success);
    assert.ok(!platformSearchInput.safeParse({ last4: '4242', reason: 'short' }).success);
    assert.ok(
      platformSearchInput.safeParse({ last4: '4242', reason: 'Support case 1234 for the buyer' })
        .success,
    );
    assert.deepEqual(resolveWindow({}, new Date('2026-10-25T10:00:00Z')), {
      from: '2026-07-27',
      to: '2026-10-25',
    });
    assert.equal(hostOf('https://shop.example/thanks'), 'shop.example');
    assert.equal(hostOf('nonsense'), null);
    assert.equal(
      addressLine({ line1: '1 Main St', city: 'Austin', country: 'US' }),
      '1 Main St, Austin, US',
    );
  });

  const mine = pay(company, '4242', 'visa', '49.9000', 3);
  pay(company, '4242', 'visa', '10.0000', 200);
  pay(company, '1111', 'visa', '5.0000', 2);
  const theirs = pay(other, '4242', 'mastercard', '99.0000', 1);
  db.seed('companies', { id: company, name: 'Acme Ltd' });
  db.seed('companies', { id: other, name: 'Beta Co' });
  db.seed('company_settings', {
    company_id: other,
    section: 'profile',
    value: { website: 'https://beta.example' },
  });

  await check(
    'an owner finds only the own payments in the window, with the payer facts',
    async () => {
      const rows = await searchOwnPayments(actor({}), { last4: '4242' });
      assert.deepEqual(
        rows.map((r) => r.paymentId),
        [mine],
      );
      const r = rows[0]!;
      assert.equal(r.payer.name, 'Ann Lee');
      assert.equal(r.payer.email, 'ann@example.com');
      assert.equal(r.payer.address, '1 Main St, Austin, TX, 73301, US');
      assert.equal(r.merchant.name, 'Acme Ltd');
      assert.equal(r.amount, '49.9000');
      assert.equal(audits.at(-1)?.action, 'payment.card_search');
      assert.equal(audits.at(-1)?.metadata?.found, 1);
      const wide = await searchOwnPayments(actor({}), {
        last4: '4242',
        from: '2026-01-01',
        to: '2026-12-31',
      });
      assert.equal(wide.length, 2);
      assert.equal(
        (await searchOwnPayments(actor({}), { last4: '4242', brand: 'mastercard' })).length,
        0,
      );
    },
  );

  await check('an owner without the payment permission is refused', async () => {
    allowed = false;
    await assert.rejects(() => searchOwnPayments(actor({}), { last4: '4242' }));
    allowed = true;
  });

  await check(
    'platform staff see every company, with the merchant and its site, and the search is audited with the reason',
    async () => {
      const staff = actor({ role: 'admin_staff', companyId: null });
      const rows = await searchAllPayments(staff, {
        last4: '4242',
        reason: 'Support case 1234 for the buyer',
      });
      assert.deepEqual(new Set(rows.map((r) => r.paymentId)), new Set([mine, theirs]));
      const beta = rows.find((r) => r.paymentId === theirs)!;
      assert.equal(beta.merchant.name, 'Beta Co');
      assert.equal(beta.merchant.website, 'https://beta.example');
      const entry = audits.at(-1)!;
      assert.equal(entry.metadata?.scope, 'platform');
      assert.equal(entry.metadata?.reason, 'Support case 1234 for the buyer');
      assert.equal(entry.metadata?.found, 2);
      assert.ok(!JSON.stringify(entry).includes('ann@example.com'));
      const one = await searchAllPayments(staff, {
        last4: '4242',
        companyId: other,
        reason: 'Support case 1234 for the buyer',
      });
      assert.equal(one.length, 1);
    },
  );

  await check(
    'platform search needs a platform role, the permission, a fresh sign-in check and room in the rate limit',
    async () => {
      const reason = 'Support case 1234 for the buyer';
      await assert.rejects(() => searchAllPayments(actor({}), { last4: '4242', reason }));
      const staff = actor({ role: 'admin_staff', companyId: null });
      allowed = false;
      await assert.rejects(() => searchAllPayments(staff, { last4: '4242', reason }));
      allowed = true;
      stepUpFresh = false;
      await assert.rejects(() => searchAllPayments(staff, { last4: '4242', reason }), /step-up/);
      stepUpFresh = true;
      rateOk = false;
      await assert.rejects(() => searchAllPayments(staff, { last4: '4242', reason }));
      rateOk = true;
      await assert.rejects(() => searchAllPayments(staff, { last4: '4242' }));
    },
  );

  process.stdout.write(`step16-card-search: ${checks} checks passed\n`);
})().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
});
