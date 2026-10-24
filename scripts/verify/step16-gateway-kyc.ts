// path: scripts/verify/step16-gateway-kyc.ts
// Logic checks of the sub-merchant KYC (16.13) that need no database or network: the link input and token, the business input, the
// review actions, readiness, what the applicant may do in each state, the shown state of an expired approval and the verified
// test of the gateway gate. The tables are tested in sql/assertions/s16_020_sub_merchant_kyc.sql; the services need a running app.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step16-gateway-kyc.ts
import assert from 'node:assert/strict';
import {
  KYC_TOKEN_SHAPE,
  applicantMode,
  hashKycToken,
  isReady,
  kycBusinessInput,
  kycLinkInput,
  kycReviewAction,
  makeKycToken,
  missingDocuments,
  shownStatus,
  verifiedUntil,
} from '@/lib/gateway/kyc-rules';

let checks = 0;
const check = async (name: string, fn: () => void | Promise<void>): Promise<void> => {
  try {
    await fn();
    checks += 1;
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    throw error;
  }
};

const NOW = new Date('2026-10-24T10:00:00Z');
type DocStatus = 'pending' | 'accepted' | 'rejected';
const docs = (
  statuses: DocStatus[],
): {
  docType: 'id_front' | 'id_back' | 'business_registration' | 'address_proof';
  status: DocStatus;
}[] =>
  (['id_front', 'id_back', 'business_registration', 'address_proof'] as const).map(
    (docType, i) => ({
      docType,
      status: statuses[i] ?? 'pending',
    }),
  );

async function main(): Promise<void> {
  await check('link: default 14 days, 1 to 30, strict', () => {
    assert.equal(kycLinkInput.parse({}).expiresInDays, 14);
    assert.equal(kycLinkInput.safeParse({ expiresInDays: 0 }).success, false);
    assert.equal(kycLinkInput.safeParse({ expiresInDays: 31 }).success, false);
    assert.equal(kycLinkInput.safeParse({ extra: 1 }).success, false);
  });

  await check(
    'token: 40 characters, different each time, only a one-way hash is kept',
    async () => {
      const a = makeKycToken();
      const b = makeKycToken();
      assert.match(a, KYC_TOKEN_SHAPE);
      assert.notEqual(a, b);
      const hash = await hashKycToken(a);
      assert.match(hash, /^[0-9a-f]{64}$/);
      assert.ok(!hash.includes(a));
      assert.equal(hash, await hashKycToken(a));
      assert.notEqual(hash, await hashKycToken(b));
      for (const bad of ['', 'short', 'x'.repeat(41), 'a'.repeat(39) + '!', 'a'.repeat(39) + ' '])
        assert.equal(KYC_TOKEN_SHAPE.test(bad), false, bad);
    },
  );

  await check('business input: a name and a two-letter country in capitals', () => {
    assert.ok(kycBusinessInput.safeParse({ businessName: 'Acme Trading', country: 'US' }).success);
    assert.equal(kycBusinessInput.safeParse({ businessName: 'A', country: 'US' }).success, false);
    assert.equal(
      kycBusinessInput.safeParse({ businessName: 'Acme', country: 'us' }).success,
      false,
    );
    assert.equal(
      kycBusinessInput.safeParse({ businessName: '<b>Acme</b>', country: 'US' }).success,
      false,
    );
    assert.equal(
      kycBusinessInput.safeParse({ businessName: 'Acme', country: 'US', x: 1 }).success,
      false,
    );
  });

  await check(
    'review actions: strict, reasons needed, the hand-check flag defaults to false',
    () => {
      assert.ok(kycReviewAction.safeParse({ action: 'start' }).success);
      const approve = kycReviewAction.parse({ action: 'approve' });
      assert.equal(approve.action === 'approve' && approve.screeningCheckedByHand, false);
      assert.equal(kycReviewAction.safeParse({ action: 'approve', extra: 1 }).success, false);
      assert.equal(kycReviewAction.safeParse({ action: 'reject', reason: 'no' }).success, false);
      assert.ok(
        kycReviewAction.safeParse({ action: 'reject', reason: 'The documents do not match.' })
          .success,
      );
      assert.equal(
        kycReviewAction.safeParse({ action: 'documents', documents: [] }).success,
        false,
      );
      assert.equal(
        kycReviewAction.safeParse({ action: 'note', risk: 'extreme', note: '' }).success,
        false,
      );
      assert.equal(kycReviewAction.safeParse({ action: 'delete' }).success, false);
    },
  );

  await check('readiness: business, an owner and four documents that are not rejected', () => {
    const full = {
      businessName: 'Acme',
      businessCountry: 'US',
      ownerCount: 1,
      documents: docs([]),
    };
    assert.ok(isReady(full));
    assert.deepEqual(missingDocuments(full), []);
    assert.ok(!isReady({ ...full, businessName: null }));
    assert.ok(!isReady({ ...full, businessCountry: null }));
    assert.ok(!isReady({ ...full, ownerCount: 0 }));
    const rejected = { ...full, documents: docs(['accepted', 'rejected']) };
    assert.deepEqual(missingDocuments(rejected), ['id_back']);
    assert.ok(!isReady(rejected));
    assert.ok(!isReady({ ...full, documents: docs([]).slice(0, 3) }));
  });

  await check('what the applicant may do', () => {
    assert.equal(applicantMode('none', null, NOW), 'edit');
    assert.equal(applicantMode('draft', null, NOW), 'edit');
    assert.equal(applicantMode('changes_requested', null, NOW), 'edit');
    assert.equal(applicantMode('submitted', null, NOW), 'locked');
    assert.equal(applicantMode('in_review', null, NOW), 'locked');
    assert.equal(applicantMode('rejected', null, NOW), 'new_round');
    assert.equal(applicantMode('expired', null, NOW), 'new_round');
    assert.equal(applicantMode('approved', '2028-10-24T00:00:00Z', NOW), 'locked');
    assert.equal(applicantMode('approved', '2026-11-10T00:00:00Z', NOW), 'new_round');
  });

  await check(
    'an approval that ran out reads expired, a verified date must be in the future',
    () => {
      assert.equal(shownStatus('approved', '2026-10-01T00:00:00Z', NOW), 'expired');
      assert.equal(shownStatus('approved', '2028-10-01T00:00:00Z', NOW), 'approved');
      assert.equal(shownStatus('in_review', '2026-10-01T00:00:00Z', NOW), 'in_review');
      assert.equal(verifiedUntil(null, NOW), false);
      assert.equal(verifiedUntil('2026-10-24T09:59:59Z', NOW), false);
      assert.equal(verifiedUntil('2026-10-24T10:00:01Z', NOW), true);
    },
  );

  process.stdout.write(`step16-gateway-kyc: ${checks} checks passed\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
