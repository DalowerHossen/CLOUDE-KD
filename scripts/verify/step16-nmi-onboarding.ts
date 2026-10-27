// path: scripts/verify/step16-nmi-onboarding.ts
// NMI merchant onboarding (docs/processors/nmi.md section 13): the sign-up client asks for a token once and renews it after a
// 401, writes carry an idempotency key, a refusal is shown with its messages, the webhook signature is the hex HMAC-SHA256 of
// the raw body, the events lead to the documented states, and form values become the API's values.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step16-nmi-onboarding.ts
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { setTransportForVerification, type HttpRequest } from '@/lib/payment/http-client';
import {
  failIfRefused,
  multipartDocument,
  problemOf,
  signupCall,
  type PartnerAccess,
} from '@/lib/payment/onboarding/nmi-signup';
import {
  EVENT_STATUS,
  applicationData,
  compactFields,
  createApplicationInput,
  documentInput,
  isEditable,
  valueFromInput,
} from '@/lib/payment/onboarding/rules';
import { signatureMatches } from '@/services/payment/onboarding';

let checks = 0;
async function check(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    checks += 1;
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    throw error;
  }
}

const seen: HttpRequest[] = [];
let tokenCount = 0;
let rejectFirstCall = false;
setTransportForVerification(async (request) => {
  seen.push(request);
  if (request.url.endsWith('/oauth/token')) {
    tokenCount += 1;
    return {
      status: 200,
      text: JSON.stringify({
        token_type: 'Bearer',
        expires_in: 3600,
        access_token: `tok${tokenCount}`,
      }),
      headers: {},
    };
  }
  if (rejectFirstCall && request.headers.authorization === 'Bearer tok1') {
    return { status: 401, text: '{}', headers: {} };
  }
  if (request.url.endsWith('/applications') && request.method === 'POST')
    return {
      status: 422,
      text: JSON.stringify({ code: 'E', message: 'Invalid.', errors: ['fld_dba is required.'] }),
      headers: {},
    };
  return { status: 200, text: JSON.stringify({ ok: true }), headers: {} };
});

const access: PartnerAccess = {
  environment: 'sandbox',
  clientId: 'client-id-1',
  clientSecret: 'client-secret-1',
};

async function main(): Promise<void> {
  await check('token once, bearer header, sandbox address', async () => {
    seen.length = 0;
    await signupCall(access, { method: 'GET', path: '/packages' });
    await signupCall(access, { method: 'GET', path: '/packages' });
    assert.equal(tokenCount, 1);
    const call = seen.find((r) => r.url.endsWith('/packages'));
    assert.equal(call?.url, 'https://sandbox.signup.nmi.com/api/v1/packages');
    assert.equal(call?.headers.authorization, 'Bearer tok1');
    const tokenRequest = seen.find((r) => r.url.endsWith('/oauth/token'));
    assert.match(tokenRequest?.body ?? '', /"grant_type":"client_credentials"/);
  });

  await check('a 401 renews the token once and repeats the call', async () => {
    seen.length = 0;
    rejectFirstCall = true;
    const result = await signupCall(access, { method: 'GET', path: '/packages' });
    rejectFirstCall = false;
    assert.equal(result.status, 200);
    assert.equal(tokenCount, 2);
    assert.equal(seen.filter((r) => r.url.endsWith('/packages')).length, 2);
  });

  await check('writes carry an idempotency key; a refusal shows its messages', async () => {
    seen.length = 0;
    const result = await signupCall(access, {
      method: 'POST',
      path: '/applications',
      idempotent: true,
      body: { package_id: 'pkg_standard' },
    });
    const call = seen.find((r) => r.url.endsWith('/applications'));
    assert.match(call?.headers['idempotency-key'] ?? '', /^[0-9a-f-]{36}$/);
    assert.equal(result.status, 422);
    assert.equal(problemOf(result.body), 'Invalid. fld_dba is required.');
    assert.throws(() => failIfRefused(result), /fld_dba is required/);
  });

  await check('live uses the production sign-up address', async () => {
    seen.length = 0;
    await signupCall(
      { ...access, environment: 'live', clientId: 'live-client-1' },
      { method: 'GET', path: '/packages' },
    );
    assert.ok(seen.some((r) => r.url === 'https://secure.nmi.com/api/v5/signup/packages'));
  });

  await check('document upload is multipart with a type and a file', () => {
    const part = multipartDocument(
      'Void Check',
      'a b.pdf',
      'application/pdf',
      new Uint8Array([1, 2, 3]),
    );
    assert.match(part.contentType, /^multipart\/form-data; boundary=kd[0-9a-f]{32}$/);
    const text = Buffer.from(part.data).toString('latin1');
    assert.match(text, /name="type"\r\n\r\nVoid Check/);
    assert.match(text, /name="file"; filename="a_b.pdf"/);
    assert.match(text, /Content-Type: application\/pdf/);
  });

  await check('webhook signature is the hex HMAC-SHA256 of the raw body', () => {
    const body =
      '{"event_id":"e1","event_type":"application.approved","event_body":{"app_id":"app_0123456789abcdef"}}';
    const good = createHmac('sha256', 'secret-123').update(body).digest('hex');
    assert.equal(signatureMatches(body, good, 'secret-123'), true);
    assert.equal(signatureMatches(body, good.toUpperCase(), 'secret-123'), true);
    assert.equal(signatureMatches(`${body} `, good, 'secret-123'), false);
    assert.equal(signatureMatches(body, good, 'other-secret'), false);
    assert.equal(signatureMatches(body, 'abc', 'secret-123'), false);
  });

  await check('events lead to the documented states', () => {
    assert.deepEqual(EVENT_STATUS, {
      'application.updated.data.requested': 'underwriter_requested_information',
      'application.approved': 'approved',
      'application.declined': 'rejected',
      'application.cancelled': 'cancelled',
      'application.merchant.boarded': 'boarded',
      'application.merchant.closed': 'closed',
    });
    assert.equal(isEditable('draft'), true);
    assert.equal(isEditable('submitted'), false);
  });

  await check('form values become API values; empty optional values are not sent', () => {
    assert.equal(valueFromInput('integer', '12'), 12);
    assert.equal(valueFromInput('decimal', '12.50'), 12.5);
    assert.equal(valueFromInput('boolean', 'true'), true);
    assert.equal(valueFromInput('string', '  '), null);
    assert.deepEqual(
      compactFields([
        { id: 'fld_aaa', value: 'x' },
        { id: 'fld_bbb', value: null },
        { id: 'fld_ccc', value: '' },
      ]),
      [{ id: 'fld_aaa', value: 'x' }],
    );
  });

  await check('inputs are strict', () => {
    assert.equal(
      applicationData.safeParse({ fields: [{ id: 'bad', value: 'x' }], collections: [] }).success,
      false,
    );
    assert.equal(
      createApplicationInput.safeParse({
        companyId: '0190c4a2-7b7e-7c8e-9a52-3f0d2a1b4c5d',
        packageId: 'pkg_standard',
        data: { fields: [], collections: [] },
        extra: 1,
      }).success,
      false,
    );
    assert.equal(
      documentInput.safeParse({
        type: 'Other',
        fileName: 'a.exe',
        mimeType: 'application/x-msdownload',
        dataBase64: 'AAAAAAAA',
      }).success,
      false,
    );
  });

  setTransportForVerification(null);
  process.stdout.write(`step16-nmi-onboarding: ${checks} checks passed\n`);
}

void main();
