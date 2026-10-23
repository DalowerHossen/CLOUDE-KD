// path: scripts/verify/step16-webhooks-out.ts
// Logic checks of outgoing webhooks (16.2) that need no database or network: the address guard against private and internal
// targets, the address ranges, the connect-time check of what a host name resolves to, the signature header (with the old
// secret during a rotation) and how a receiver checks it, the retry schedule and the switch-off rule, the event list, the
// envelope and headers, and the inputs. The outbox, the claim function and the guards are tested in
// sql/assertions/s16_002_webhooks_out.sql. Sending to a real receiver, the encrypted secret round trip, the switch-off with the
// owner's notice and the pages need a running app.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step16-webhooks-out.ts
import assert from 'node:assert/strict';
import {
  WEBHOOK_DISABLE_AFTER_FAILURES,
  WEBHOOK_EVENTS,
  WEBHOOK_MAX_ATTEMPTS,
  WEBHOOK_RETRY_SECONDS,
} from '@/config/s16-api';
import { checkWebhookUrl, isBlockedHostname, isPublicIp, parseIpv6 } from '@/lib/integrations/ssrf';
import {
  afterAttempt,
  buildEnvelope,
  clipBody,
  deliveryHeaders,
  endpointInput,
  endpointUpdate,
  isSuccess,
  makeSecret,
  previousSecretValid,
  shouldDisable,
  signatureHeader,
  testEnvelope,
  verifySignatureHeader,
} from '@/lib/integrations/webhook-rules';
import { makeHttpsTransport, resolvePublicAddress } from '@/lib/integrations/webhook-transport';
import { DOMAIN_EVENT_NAMES } from '@/types/events';

let checks = 0;
const check = (name: string, fn: () => void | Promise<void>): Promise<void> =>
  Promise.resolve()
    .then(fn)
    .then(() => {
      checks += 1;
    })
    .catch((error: unknown) => {
      process.stderr.write(`FAIL ${name}\n`);
      throw error;
    });

async function main(): Promise<void> {
  await check('addresses: https on a public host name is accepted', () => {
    for (const ok of [
      'https://hooks.example.com/kd',
      'https://example.com:8443/a?b=1',
      'https://sub.domain.example.org:443/x',
      'https://example.com:1024/x',
    ])
      assert.ok(checkWebhookUrl(ok).ok, ok);
  });

  await check(
    'addresses: plain http, credentials, fragments, odd ports and junk are refused',
    () => {
      for (const bad of [
        'http://example.com/x',
        'ftp://example.com/x',
        'https://user:pass@example.com/x',
        'https://example.com/x#frag',
        'https://example.com:80/x',
        'https://example.com:22/x',
        'https://example.com:65536/x',
        'not a url',
        '',
        'https://exa mple.com/',
        `https://example.com/${'a'.repeat(2100)}`,
      ])
        assert.ok(!checkWebhookUrl(bad).ok, bad);
    },
  );

  await check('addresses: IP addresses in any spelling and internal names are refused', () => {
    for (const bad of [
      'https://127.0.0.1/x',
      'https://2130706433/x',
      'https://0x7f000001/x',
      'https://017700000001/x',
      'https://127.1/x',
      'https://8.8.8.8/x',
      'https://[::1]/x',
      'https://[::ffff:127.0.0.1]/x',
      'https://[2001:db8::1]/x',
      'https://localhost/x',
      'https://LOCALHOST./x',
      'https://api.localhost/x',
      'https://printer.local/x',
      'https://db.internal/x',
      'https://metadata.google.internal/x',
      'https://intranet/x',
      'https://router.lan/x',
    ])
      assert.ok(!checkWebhookUrl(bad).ok, bad);
    assert.ok(isBlockedHostname('x.home.arpa'));
    assert.ok(!isBlockedHostname('example.com'));
  });

  await check(
    'IPv4 ranges: private, loopback, link-local (cloud metadata), shared and reserved are not public',
    () => {
      for (const bad of [
        '0.0.0.0',
        '10.0.0.1',
        '10.255.255.255',
        '100.64.0.1',
        '100.127.255.255',
        '127.0.0.1',
        '127.255.0.1',
        '169.254.169.254',
        '172.16.0.1',
        '172.31.255.255',
        '192.0.0.1',
        '192.0.2.1',
        '192.168.1.1',
        '198.18.0.1',
        '198.19.255.255',
        '198.51.100.7',
        '203.0.113.9',
        '224.0.0.1',
        '239.255.255.255',
        '240.0.0.1',
        '255.255.255.255',
      ])
        assert.ok(!isPublicIp(bad), bad);
      for (const good of [
        '8.8.8.8',
        '1.1.1.1',
        '93.184.216.34',
        '172.15.0.1',
        '172.32.0.1',
        '100.63.255.255',
        '11.0.0.1',
      ])
        assert.ok(isPublicIp(good), good);
      assert.ok(!isPublicIp('999.1.1.1'));
      assert.ok(!isPublicIp('1.2.3'));
    },
  );

  await check(
    'IPv6 ranges: loopback, mapped IPv4, unique local, link-local and documentation are not public',
    () => {
      for (const bad of [
        '::',
        '::1',
        '::ffff:127.0.0.1',
        '::ffff:7f00:1',
        '::ffff:10.0.0.1',
        '::ffff:a9fe:a9fe',
        'fc00::1',
        'fd12:3456::1',
        'fe80::1',
        'fec0::1',
        'ff02::1',
        '2001:db8::1',
        '2001::1',
        '64:ff9b::7f00:1',
        '2002:7f00:0001::1',
        '[::1]',
      ])
        assert.ok(!isPublicIp(bad), bad);
      for (const good of ['2606:4700:4700::1111', '2001:4860:4860::8888', '::ffff:8.8.8.8'])
        assert.ok(isPublicIp(good), good);
      assert.deepEqual(parseIpv6('::1'), [0, 0, 0, 0, 0, 0, 0, 1]);
      assert.equal(parseIpv6('1::2::3'), null);
      assert.equal(parseIpv6('gggg::1'), null);
    },
  );

  await check(
    'connect time: a name that resolves to any private address is refused, a public one gives the address to use',
    async () => {
      const pub = [{ address: '8.8.8.8', family: 4 }];
      assert.deepEqual(await resolvePublicAddress('a.example.com', async () => pub), {
        ok: true,
        address: '8.8.8.8',
        family: 4,
      });
      const mixed = [
        { address: '8.8.8.8', family: 4 },
        { address: '10.0.0.5', family: 4 },
      ];
      const refused = await resolvePublicAddress('b.example.com', async () => mixed);
      assert.equal(refused.ok, false);
      assert.equal(
        (
          await resolvePublicAddress('c.example.com', async () => [
            { address: '127.0.0.1', family: 4 },
          ])
        ).ok,
        false,
      );
      assert.equal(
        (await resolvePublicAddress('d.example.com', async () => [{ address: '::1', family: 6 }]))
          .ok,
        false,
      );
      assert.equal((await resolvePublicAddress('e.example.com', async () => [])).ok, false);
      assert.equal(
        (
          await resolvePublicAddress('f.example.com', async () => {
            throw new Error('nx');
          })
        ).ok,
        false,
      );
    },
  );

  await check(
    'the transport never connects to a host that resolves into the private network',
    async () => {
      const transport = makeHttpsTransport(async () => [{ address: '169.254.169.254', family: 4 }]);
      const result = await transport({
        url: new URL('https://hooks.example.com/x'),
        headers: {},
        body: '{}',
      });
      assert.equal(result.statusCode, null);
      assert.match(result.error ?? '', /not allowed/);
    },
  );

  await check(
    'signature: the receiver accepts the right secret and refuses a wrong secret, a changed body and an old time',
    async () => {
      const secret = makeSecret();
      const body = JSON.stringify({ id: 'evt_1', type: 'invoice.paid' });
      const now = new Date('2026-06-01T10:00:00Z');
      const ts = Math.floor(now.getTime() / 1000);
      const header = await signatureHeader([secret], ts, body);
      assert.match(header, /^t=\d+,v1=[0-9a-f]{64}$/);
      assert.ok(await verifySignatureHeader(secret, header, body, now));
      assert.ok(!(await verifySignatureHeader(makeSecret(), header, body, now)));
      assert.ok(!(await verifySignatureHeader(secret, header, `${body} `, now)));
      assert.ok(
        !(await verifySignatureHeader(secret, header, body, new Date(now.getTime() + 301_000))),
      );
      assert.ok(
        !(await verifySignatureHeader(secret, header, body, new Date(now.getTime() - 301_000))),
      );
      assert.ok(!(await verifySignatureHeader(secret, 'v1=abc', body, now)));
      assert.ok(!(await verifySignatureHeader(secret, `t=${ts}`, body, now)));
      assert.ok(!(await verifySignatureHeader(secret, `t=abc,v1=${'0'.repeat(64)}`, body, now)));
    },
  );

  await check(
    'rotation: during the overlap both secrets verify, and a header made with one secret does not verify with the other alone',
    async () => {
      const fresh = makeSecret();
      const old = makeSecret();
      const body = '{"a":1}';
      const now = new Date('2026-06-01T10:00:00Z');
      const ts = Math.floor(now.getTime() / 1000);
      const both = await signatureHeader([fresh, old], ts, body);
      assert.equal(both.split(',').filter((p) => p.startsWith('v1=')).length, 2);
      assert.ok(await verifySignatureHeader(fresh, both, body, now));
      assert.ok(await verifySignatureHeader(old, both, body, now));
      const only = await signatureHeader([fresh], ts, body);
      assert.ok(!(await verifySignatureHeader(old, only, body, now)));
      assert.ok(previousSecretValid('2026-06-02T10:00:00Z', now));
      assert.ok(!previousSecretValid('2026-06-01T10:00:00Z', now));
      assert.ok(!previousSecretValid(null, now));
    },
  );

  await check('secrets look right and differ', () => {
    const a = makeSecret();
    assert.match(a, /^whsec_[0-9A-Za-z]{40}$/);
    assert.notEqual(a, makeSecret());
  });

  await check(
    'retries: eight tries in all, the delays are 1 min, 5 min, 30 min, 2 h, 6 h, 12 h, 24 h, then it gives up',
    () => {
      assert.deepEqual(WEBHOOK_RETRY_SECONDS, [60, 300, 1800, 7200, 21600, 43200, 86400]);
      assert.equal(WEBHOOK_MAX_ATTEMPTS, 8);
      assert.deepEqual(afterAttempt(1, true), { status: 'succeeded' });
      const delays: number[] = [];
      for (let attempt = 1; attempt < 8; attempt += 1) {
        const next = afterAttempt(attempt, false);
        assert.equal(next.status, 'retrying');
        if (next.status === 'retrying') delays.push(next.delaySeconds);
      }
      assert.deepEqual(delays, [60, 300, 1800, 7200, 21600, 43200, 86400]);
      assert.deepEqual(afterAttempt(8, false), { status: 'dead' });
      assert.deepEqual(afterAttempt(5, true), { status: 'succeeded' });
    },
  );

  await check('an endpoint is switched off after ten failures in a row', () => {
    assert.equal(WEBHOOK_DISABLE_AFTER_FAILURES, 10);
    assert.ok(!shouldDisable(9));
    assert.ok(shouldDisable(10));
    assert.ok(shouldDisable(11));
    assert.ok(isSuccess(200) && isSuccess(204) && isSuccess(299));
    assert.ok(!isSuccess(301) && !isSuccess(404) && !isSuccess(500) && !isSuccess(null));
  });

  await check(
    'only business events can be subscribed to; security, sign-in, KYC, file and payroll events never leave',
    () => {
      assert.ok(WEBHOOK_EVENTS.every((e) => (DOMAIN_EVENT_NAMES as readonly string[]).includes(e)));
      for (const prefix of ['auth.', 'kyc.', 'security.', 'file.', 'payroll.', 'expense.'])
        assert.ok(!WEBHOOK_EVENTS.some((e) => e.startsWith(prefix)), prefix);
      assert.ok(WEBHOOK_EVENTS.includes('invoice.paid'));
      assert.ok(WEBHOOK_EVENTS.includes('payment.refunded'));
    },
  );

  await check('the envelope and the request headers', () => {
    const env = buildEnvelope({
      eventId: 'e1',
      name: 'invoice.paid',
      occurredAt: '2026-01-01T00:00:00.000Z',
      payload: { invoiceId: 'x' },
    });
    assert.deepEqual(env, {
      id: 'e1',
      type: 'invoice.paid',
      created: '2026-01-01T00:00:00.000Z',
      api_version: 'v1',
      data: { invoiceId: 'x' },
    });
    const test = testEnvelope('abc', new Date('2026-01-01T00:00:00Z'));
    assert.equal(test.type, 'webhook.test');
    const headers = deliveryHeaders({
      deliveryId: 'd1',
      eventId: 'e1',
      eventName: 'invoice.paid',
      attempt: 3,
      signature: 't=1,v1=ab',
    });
    assert.equal(headers['x-kd-attempt'], '3');
    assert.equal(headers['x-kd-signature'], 't=1,v1=ab');
    assert.equal(headers['x-kd-event-id'], 'e1');
    assert.equal(clipBody('a'.repeat(3000)).length, 2000);
    assert.equal(clipBody('short'), 'short');
  });

  await check(
    'inputs: https addresses and known events only, unknown fields refused, the version is needed to change',
    () => {
      const ok = endpointInput.safeParse({
        url: 'https://example.com/h',
        events: ['invoice.paid'],
      });
      assert.ok(ok.success);
      assert.equal(ok.success && ok.data.description, '');
      assert.ok(
        !endpointInput.safeParse({ url: 'http://example.com/h', events: ['invoice.paid'] }).success,
      );
      assert.ok(
        !endpointInput.safeParse({ url: 'https://127.0.0.1/h', events: ['invoice.paid'] }).success,
      );
      assert.ok(!endpointInput.safeParse({ url: 'https://example.com/h', events: [] }).success);
      assert.ok(
        !endpointInput.safeParse({ url: 'https://example.com/h', events: ['kyc.approved'] })
          .success,
      );
      assert.ok(
        !endpointInput.safeParse({
          url: 'https://example.com/h',
          events: ['invoice.paid', 'invoice.paid'],
        }).success,
      );
      assert.ok(
        !endpointInput.safeParse({
          url: 'https://example.com/h',
          events: ['invoice.paid'],
          secret: 'x',
        }).success,
      );
      assert.ok(
        !endpointInput.safeParse({
          url: 'https://example.com/h',
          events: ['invoice.paid'],
          description: '<b>',
        }).success,
      );
      assert.ok(!endpointUpdate.safeParse({ status: 'paused' }).success);
      assert.ok(endpointUpdate.safeParse({ version: 1, status: 'paused' }).success);
      assert.ok(!endpointUpdate.safeParse({ version: 1, status: 'disabled' }).success);
      assert.ok(!endpointUpdate.safeParse({ version: 1, url: 'https://localhost/x' }).success);
    },
  );

  process.stdout.write(`step16-webhooks-out: ${checks} checks passed\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
