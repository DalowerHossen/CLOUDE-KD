// path: scripts/verify/step16-kyc-sumsub.ts
// Checks of the online identity check helpers: request signing, webhook signature and result reading.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step16-kyc-sumsub.ts
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  linkPath,
  readLink,
  readWebhook,
  requestSignature,
  verifyWebhookDigest,
} from '@/lib/kyc/sumsub';

let checks = 0;
const run = async (name: string, fn: () => Promise<void> | void): Promise<void> => {
  try {
    await fn();
    checks += 1;
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    throw error;
  }
};

const id = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

async function main(): Promise<void> {
  await run(
    'the request signature is the hex HMAC-SHA256 of ts + method + path + body',
    async () => {
      const path = '/resources/x?a=1';
      const expected = createHmac('sha256', 'secret')
        .update(`1700000000POST${path}body`)
        .digest('hex');
      assert.equal(await requestSignature('secret', 1700000000, 'post', path, 'body'), expected);
    },
  );
  await run('the link path carries the level name and the person id, encoded', () => {
    const path = linkPath('basic kyc', id, 3600);
    assert.ok(path.startsWith('/resources/sdkIntegrations/levels/basic%20kyc/websdkLink?'));
    assert.ok(path.includes(`externalUserId=${id}`));
    assert.ok(path.includes('ttlInSecs=3600'));
  });
  await run('only an https link is accepted', () => {
    assert.equal(
      readLink({ url: 'https://in.sumsub.com/idensic/l/#/abc' }),
      'https://in.sumsub.com/idensic/l/#/abc',
    );
    assert.equal(readLink({ url: 'http://evil.example' }), null);
    assert.equal(readLink({ url: 'javascript:alert(1)' }), null);
    assert.equal(readLink({}), null);
  });
  await run('a webhook is accepted only with the right SHA-256 digest', async () => {
    const body = '{"type":"applicantReviewed"}';
    const good = createHmac('sha256', 'whsec').update(body).digest('hex');
    assert.equal(await verifyWebhookDigest('whsec', body, good, 'HMAC_SHA256_HEX'), true);
    assert.equal(await verifyWebhookDigest('whsec', body + ' ', good, 'HMAC_SHA256_HEX'), false);
    assert.equal(await verifyWebhookDigest('other', body, good, 'HMAC_SHA256_HEX'), false);
    assert.equal(await verifyWebhookDigest('whsec', body, good, 'HMAC_SHA1_HEX'), false);
    assert.equal(await verifyWebhookDigest('whsec', body, null, 'HMAC_SHA256_HEX'), false);
    assert.equal(await verifyWebhookDigest('', body, good, 'HMAC_SHA256_HEX'), false);
  });
  await run('results are read: green approves, red retry asks again, red final rejects', () => {
    const base = { type: 'applicantReviewed', externalUserId: id, applicantId: 'a1' };
    assert.equal(
      readWebhook({ ...base, reviewResult: { reviewAnswer: 'GREEN' } })?.outcome,
      'approved',
    );
    assert.equal(
      readWebhook({ ...base, reviewResult: { reviewAnswer: 'RED', reviewRejectType: 'RETRY' } })
        ?.outcome,
      'retry',
    );
    assert.equal(
      readWebhook({ ...base, reviewResult: { reviewAnswer: 'RED', reviewRejectType: 'FINAL' } })
        ?.outcome,
      'rejected',
    );
    assert.equal(readWebhook({ type: 'applicantPending', externalUserId: id })?.pending, true);
    assert.equal(readWebhook({ type: 'applicantCreated', externalUserId: id })?.outcome, null);
  });
  await run('an event without a person id or with markup in the comment is handled safely', () => {
    assert.equal(readWebhook({ type: 'applicantReviewed' }), null);
    assert.equal(readWebhook('x'), null);
    const out = readWebhook({
      type: 'applicantReviewed',
      externalUserId: id,
      reviewResult: { reviewAnswer: 'RED', moderationComment: '<script>x</script>' },
    });
    assert.equal(out?.comment.includes('<'), false);
  });
  process.stdout.write(`step16-kyc-sumsub: ${checks} checks passed\n`);
}
void main();
