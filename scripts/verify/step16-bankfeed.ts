// path: scripts/verify/step16-bankfeed.ts
// Logic checks of the bank feed (16.7) that need no database or network: the inputs, reading Plaid and Salt Edge transactions into
// signed lines (Plaid money out is positive and is turned), what is left out, the key of a batch, what each webhook message means,
// the check of a Plaid token (made here with a real ES256 key) and of a Salt Edge callback and request signature (made here with a
// real RSA key), and the calls of both services with a fake transport that follows the documentation (docs/integrations/plaid.md and
// saltedge.md): the address, where the keys travel, the bodies, paging, and that the keys never appear in an error. The tables are
// tested in sql/assertions/s16_015_bankfeed.sql. The sync, the routes and the pages need a running app and real accounts.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step16-bankfeed.ts
import assert from 'node:assert/strict';
import { createHash, createSign, createVerify, generateKeyPairSync } from 'node:crypto';
import {
  type FeedLine,
  accountMap,
  bankConnect,
  batchKeyOf,
  chunk,
  mappable,
  needsReauth,
  parsePlaidWebhook,
  parseSaltEdgeCallback,
  plaidTokenHeader,
  readPlaidTransaction,
  readSaltEdgeTransaction,
  readTransactions,
  saltedgeNeedsReauth,
  signSaltEdgeRequest,
  verifyPlaidWebhook,
  verifySaltEdgeCallback,
} from '@/lib/integrations/bank-rules';
import { CommerceApiError, type Transport } from '@/lib/integrations/commerce-http';
import * as plaid from '@/lib/integrations/plaid';
import * as saltedge from '@/lib/integrations/saltedge';

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

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}
const fake = (
  answers: { status?: number; json: unknown }[],
): { calls: Call[]; transport: Transport } => {
  const calls: Call[] = [];
  let i = 0;
  return {
    calls,
    transport: async (url, options) => {
      calls.push({ url, method: options.method, headers: options.headers, body: options.body });
      const a = answers[Math.min(i, answers.length - 1)] ?? { json: {} };
      i += 1;
      return { status: a.status ?? 200, body: Buffer.from(JSON.stringify(a.json)) };
    },
  };
};
const body = (c: Call | undefined): Record<string, unknown> =>
  JSON.parse(String(c?.body)) as Record<string, unknown>;

const PLAID: plaid.PlaidKeys = {
  clientId: 'client1234567890',
  secret: 'plaid-secret-0123456789',
  environment: 'sandbox',
};
const SE: saltedge.SaltEdgeKeys = {
  appId: 'appid-1234567890',
  secret: 'saltedge-secret-0123456789',
};
const b64url = (b: Buffer | string): string => Buffer.from(b).toString('base64url');

async function main(): Promise<void> {
  await check('inputs: strict, with the keys each service needs', () => {
    const plaidIn = {
      provider: 'plaid',
      name: 'Main bank',
      clientId: 'abc1234567890def',
      secret: 'plaid-secret-0123456789',
    };
    assert.ok(bankConnect.safeParse(plaidIn).success);
    const parsedPlaid = bankConnect.parse(plaidIn);
    assert.equal(parsedPlaid.provider === 'plaid' ? parsedPlaid.environment : null, 'production');
    assert.ok(!bankConnect.safeParse({ ...plaidIn, environment: 'dev' }).success);
    assert.ok(!bankConnect.safeParse({ ...plaidIn, countryCodes: ['XX'] }).success);
    assert.ok(!bankConnect.safeParse({ ...plaidIn, extra: 1 }).success);
    assert.ok(!bankConnect.safeParse({ ...plaidIn, name: '<b>x</b>' }).success);
    assert.ok(!bankConnect.safeParse({ ...plaidIn, secret: 'short' }).success);
    const se = {
      provider: 'saltedge',
      name: 'EU bank',
      appId: 'appid-1234567890',
      secret: 'saltedge-secret-0123456789',
    };
    assert.ok(bankConnect.safeParse(se).success);
    assert.ok(!bankConnect.safeParse({ ...se, privateKey: 'not a key' }).success);
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    assert.ok(bankConnect.safeParse({ ...se, privateKey }).success);
    assert.ok(accountMap.safeParse({ bankAccountId: null }).success);
    assert.ok(
      accountMap.safeParse({
        bankAccountId: '11111111-1111-4111-8111-111111111111',
        enabled: false,
      }).success,
    );
    assert.ok(!accountMap.safeParse({ bankAccountId: 'abc' }).success);
    assert.equal(mappable('USD'), true);
    assert.equal(mappable(null), true);
    assert.equal(mappable('EUR'), false);
  });

  await check(
    'Plaid lines: money out is positive at Plaid and negative in the books; pending, other currency and bad lines are left out',
    () => {
      const base = {
        transaction_id: 'tx-1',
        account_id: 'acc-1',
        date: '2026-10-20',
        name: 'Coffee Shop',
        iso_currency_code: 'USD',
        pending: false,
        payment_meta: { reference_number: 'REF-9' },
      };
      const out = readPlaidTransaction({ ...base, amount: 40 });
      assert.ok(out.ok);
      assert.equal(out.ok && out.line.amount, '-40.0000');
      assert.equal(out.ok && out.line.reference, 'REF-9');
      assert.equal(out.ok && out.line.externalId, 'tx-1');
      const income = readPlaidTransaction({ ...base, amount: -12.5 });
      assert.equal(income.ok && income.line.amount, '12.5000');
      assert.deepEqual(readPlaidTransaction({ ...base, amount: 5, pending: true }), {
        ok: false,
        reason: 'pending',
      });
      assert.deepEqual(readPlaidTransaction({ ...base, amount: 5, iso_currency_code: 'EUR' }), {
        ok: false,
        reason: 'currency',
      });
      assert.deepEqual(readPlaidTransaction({ ...base, amount: 5, iso_currency_code: null }), {
        ok: false,
        reason: 'currency',
      });
      assert.deepEqual(readPlaidTransaction({ ...base, amount: 0 }), { ok: false, reason: 'zero' });
      assert.deepEqual(readPlaidTransaction({ ...base, amount: 'abc' }), {
        ok: false,
        reason: 'invalid',
      });
      assert.deepEqual(readPlaidTransaction({ ...base, transaction_id: '', amount: 5 }), {
        ok: false,
        reason: 'invalid',
      });
      assert.deepEqual(readPlaidTransaction({ ...base, date: 'yesterday', amount: 5 }), {
        ok: false,
        reason: 'invalid',
      });
      const clean = readPlaidTransaction({ ...base, name: '<script>x</script>  Shop', amount: 1 });
      assert.equal(clean.ok && clean.line.description, 'scriptx/script Shop');
      assert.equal(
        readPlaidTransaction({ ...base, name: '', merchant_name: 'Acme', amount: 1 }).ok && true,
        true,
      );
    },
  );

  await check(
    'Salt Edge lines: the sign is kept, pending and duplicated lines and other currencies are left out',
    () => {
      const base = {
        id: '777',
        account_id: '5',
        status: 'posted',
        duplicated: false,
        made_on: '2026-10-21',
        amount: -19.99,
        currency_code: 'USD',
        description: 'Utility bill',
        extra: { account_balance_snapshot: 1000.5, end_to_end_id: 'E2E-1' },
      };
      const v = readSaltEdgeTransaction(base);
      assert.ok(v.ok);
      assert.equal(v.ok && v.line.amount, '-19.9900');
      assert.equal(v.ok && v.line.balance, '1000.5000');
      assert.equal(v.ok && v.line.reference, 'E2E-1');
      assert.equal(readSaltEdgeTransaction({ ...base, amount: 250 }).ok && true, true);
      assert.deepEqual(readSaltEdgeTransaction({ ...base, status: 'pending' }), {
        ok: false,
        reason: 'pending',
      });
      assert.deepEqual(readSaltEdgeTransaction({ ...base, duplicated: true }), {
        ok: false,
        reason: 'duplicate',
      });
      assert.deepEqual(readSaltEdgeTransaction({ ...base, currency_code: 'GBP' }), {
        ok: false,
        reason: 'currency',
      });
      assert.deepEqual(readSaltEdgeTransaction({ ...base, made_on: '' }), {
        ok: false,
        reason: 'invalid',
      });
    },
  );

  await check(
    'a list: a transaction id that comes twice is kept once (the last), and the left out lines are counted',
    () => {
      const t = (
        id: string,
        amount: number,
        extra: Record<string, unknown> = {},
      ): Record<string, unknown> => ({
        transaction_id: id,
        date: '2026-10-20',
        name: `Line ${id}`,
        amount,
        iso_currency_code: 'USD',
        pending: false,
        ...extra,
      });
      const r = readTransactions(
        [
          t('a', 1),
          t('b', 2),
          t('a', 3),
          t('c', 4, { pending: true }),
          t('d', 5, { iso_currency_code: 'EUR' }),
        ],
        readPlaidTransaction,
      );
      assert.deepEqual(
        r.lines.map((l) => [l.externalId, l.amount]),
        [
          ['a', '-3.0000'],
          ['b', '-2.0000'],
        ],
      );
      assert.equal(r.left.pending, 1);
      assert.equal(r.left.currency, 1);
    },
  );

  await check(
    'batch key: the same lines make the same key in any order; other lines make another key; chunks keep the order',
    () => {
      const line = (id: string): FeedLine => ({
        date: '2026-10-20',
        description: id,
        reference: '',
        externalId: id,
        amount: '1.0000',
        balance: null,
      });
      const a = batchKeyOf([line('x'), line('y'), line('z')]);
      assert.equal(a, batchKeyOf([line('z'), line('x'), line('y')]));
      assert.notEqual(a, batchKeyOf([line('x'), line('y')]));
      assert.match(a, /^[0-9a-f]{40}$/);
      assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
      assert.deepEqual(chunk([], 2), []);
    },
  );

  await check(
    'Plaid webhooks: what each message means; a temporary ERROR is not a reason to log in again',
    () => {
      assert.deepEqual(
        parsePlaidWebhook({
          webhook_type: 'LINK',
          webhook_code: 'SESSION_FINISHED',
          status: 'success',
          link_token: 'link-1',
          public_tokens: ['public-1'],
        }),
        {
          kind: 'session_finished',
          status: 'success',
          linkToken: 'link-1',
          publicTokens: ['public-1'],
        },
      );
      assert.deepEqual(
        parsePlaidWebhook({
          webhook_type: 'TRANSACTIONS',
          webhook_code: 'SYNC_UPDATES_AVAILABLE',
          item_id: 'item-1',
        }),
        { kind: 'sync_updates', itemId: 'item-1' },
      );
      assert.deepEqual(
        parsePlaidWebhook({
          webhook_type: 'ITEM',
          webhook_code: 'ERROR',
          item_id: 'item-1',
          error: { error_code: 'ITEM_LOGIN_REQUIRED' },
        }),
        { kind: 'item_problem', itemId: 'item-1', code: 'ITEM_LOGIN_REQUIRED' },
      );
      assert.deepEqual(
        parsePlaidWebhook({
          webhook_type: 'ITEM',
          webhook_code: 'ERROR',
          item_id: 'item-1',
          error: { error_code: 'INTERNAL_SERVER_ERROR' },
        }),
        { kind: 'ignored' },
      );
      assert.deepEqual(
        parsePlaidWebhook({
          webhook_type: 'ITEM',
          webhook_code: 'PENDING_EXPIRATION',
          item_id: 'item-1',
        }),
        { kind: 'item_problem', itemId: 'item-1', code: 'PENDING_EXPIRATION' },
      );
      assert.deepEqual(
        parsePlaidWebhook({
          webhook_type: 'ITEM',
          webhook_code: 'LOGIN_REPAIRED',
          item_id: 'item-1',
        }),
        { kind: 'login_repaired', itemId: 'item-1' },
      );
      assert.deepEqual(
        parsePlaidWebhook({ webhook_type: 'TRANSACTIONS', webhook_code: 'SYNC_UPDATES_AVAILABLE' }),
        { kind: 'ignored' },
      );
      assert.deepEqual(parsePlaidWebhook('x'), { kind: 'ignored' });
      assert.equal(needsReauth('ITEM_LOGIN_REQUIRED'), true);
      assert.equal(needsReauth('PENDING_DISCONNECT'), true);
      assert.equal(needsReauth('SOMETHING_ELSE'), false);
    },
  );

  await check(
    'Plaid token: ES256, the signature, an age of 5 minutes at most and the SHA-256 of the body must all fit',
    () => {
      const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
      const jwk = publicKey.export({ format: 'jwk' }) as Record<string, unknown>;
      const raw =
        '{"webhook_type":"TRANSACTIONS","webhook_code":"SYNC_UPDATES_AVAILABLE","item_id":"item-1"}';
      const now = 1_800_000_000;
      const make = (claims: Record<string, unknown>, alg = 'ES256', key = privateKey): string => {
        const head = b64url(JSON.stringify({ alg, kid: 'kid-1', typ: 'JWT' }));
        const payload = b64url(JSON.stringify(claims));
        const sig = createSign('SHA256')
          .update(`${head}.${payload}`)
          .sign({ key, dsaEncoding: 'ieee-p1363' });
        return `${head}.${payload}.${b64url(sig)}`;
      };
      const sha = createHash('sha256').update(raw).digest('hex');
      const good = make({ iat: now - 10, request_body_sha256: sha });
      assert.deepEqual(plaidTokenHeader(good), { alg: 'ES256', kid: 'kid-1' });
      assert.equal(verifyPlaidWebhook(good, jwk, raw, now), true);
      assert.equal(verifyPlaidWebhook(good, jwk, `${raw} `, now), false);
      assert.equal(
        verifyPlaidWebhook(make({ iat: now - 301, request_body_sha256: sha }), jwk, raw, now),
        false,
      );
      assert.equal(
        verifyPlaidWebhook(make({ iat: now + 120, request_body_sha256: sha }), jwk, raw, now),
        false,
      );
      assert.equal(
        verifyPlaidWebhook(make({ iat: now, request_body_sha256: 'ab' }), jwk, raw, now),
        false,
      );
      assert.equal(
        verifyPlaidWebhook(make({ iat: now, request_body_sha256: sha }, 'HS256'), jwk, raw, now),
        false,
      );
      const other = generateKeyPairSync('ec', { namedCurve: 'P-256' });
      assert.equal(
        verifyPlaidWebhook(
          make({ iat: now, request_body_sha256: sha }, 'ES256', other.privateKey),
          jwk,
          raw,
          now,
        ),
        false,
      );
      assert.equal(verifyPlaidWebhook('not.a.token', jwk, raw, now), false);
      assert.equal(verifyPlaidWebhook('x', jwk, raw, now), false);
      assert.equal(plaidTokenHeader('x'), null);
    },
  );

  await check(
    'Salt Edge callbacks: the kind comes from the data; the signature is of "callback_url|body" and the key version must be known',
    () => {
      const data = { connection_id: '111', customer_id: '222', custom_fields: { kd: 'link-1' } };
      assert.deepEqual(parseSaltEdgeCallback({ data: { ...data, stage: 'finish' } }), {
        kind: 'success',
        connectionId: '111',
        customerId: '222',
        stage: 'finish',
        appRef: 'link-1',
      });
      assert.deepEqual(parseSaltEdgeCallback({ data: { ...data, stage: 'fetch_accounts' } }), {
        kind: 'ignored',
      });
      assert.deepEqual(
        parseSaltEdgeCallback({
          data: { ...data, error_class: 'InvalidCredentials', error_message: 'x' },
        }),
        {
          kind: 'fail',
          connectionId: '111',
          customerId: '222',
          errorClass: 'InvalidCredentials',
          appRef: 'link-1',
        },
      );
      assert.deepEqual(parseSaltEdgeCallback({ data: { ...data, consent_status: 'revoked' } }), {
        kind: 'consent',
        connectionId: '111',
        customerId: '222',
        status: 'revoked',
        appRef: 'link-1',
      });
      assert.deepEqual(parseSaltEdgeCallback({ data }), {
        kind: 'destroy',
        connectionId: '111',
        customerId: '222',
        appRef: 'link-1',
      });
      assert.deepEqual(parseSaltEdgeCallback({ data: { customer_id: '1' } }), { kind: 'ignored' });
      assert.equal(saltedgeNeedsReauth('InvalidCredentials'), true);
      assert.equal(saltedgeNeedsReauth('Unfinished'), false);
      const { privateKey, publicKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' },
      });
      const url = 'https://app.example.com/api/webhooks/saltedge?k=abc';
      const raw = JSON.stringify({ data: { ...data, stage: 'finish' }, meta: { version: '6' } });
      const sig = createSign('SHA256').update(`${url}|${raw}`).sign(privateKey, 'base64');
      assert.equal(verifySaltEdgeCallback(url, raw, sig, '6.0', publicKey), true);
      assert.equal(verifySaltEdgeCallback(url, raw, sig, null, publicKey), true);
      assert.equal(verifySaltEdgeCallback(`${url}x`, raw, sig, '6.0', publicKey), false);
      assert.equal(verifySaltEdgeCallback(url, `${raw} `, sig, '6.0', publicKey), false);
      assert.equal(verifySaltEdgeCallback(url, raw, sig, '5.0', publicKey), false);
      assert.equal(verifySaltEdgeCallback(url, raw, null, '6.0', publicKey), false);
      assert.equal(verifySaltEdgeCallback(url, raw, 'AAAA', '6.0', publicKey), false);
      // The key built into the code is the one of the documentation: a signature made with another key is refused.
      assert.equal(verifySaltEdgeCallback(url, raw, sig, '6.0'), false);
    },
  );

  await check(
    'Salt Edge request signature: base64 SHA-256 RSA of "expires|METHOD|url|body", valid for one minute',
    () => {
      const { privateKey, publicKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' },
      });
      const url = 'https://www.saltedge.com/api/v6/customers/';
      const text = '{"data":{"identifier":"x"}}';
      const h = signSaltEdgeRequest(privateKey, 'post', url, text, 1_413_802_718);
      assert.equal(h['expires-at'], '1413802778');
      assert.equal(
        createVerify('SHA256')
          .update(`1413802778|POST|${url}|${text}`)
          .verify(publicKey, Buffer.from(h.signature, 'base64')),
        true,
      );
      assert.equal(
        createVerify('SHA256')
          .update(`1413802778|GET|${url}|${text}`)
          .verify(publicKey, Buffer.from(h.signature, 'base64')),
        false,
      );
    },
  );

  await check(
    'Plaid calls: keys in headers, Hosted Link with the webhook, update mode with the access token, exchange, accounts',
    async () => {
      const f = fake([
        {
          json: {
            link_token: 'link-sandbox-1',
            hosted_link_url: 'https://secure.plaid.com/hl/abc',
            expiration: '2026-10-24T00:00:00Z',
          },
        },
        {
          json: {
            link_token: 'link-sandbox-2',
            hosted_link_url: 'https://secure.plaid.com/hl/def',
            expiration: '2026-10-24T00:30:00Z',
          },
        },
        { json: { access_token: 'access-sandbox-1', item_id: 'item-1' } },
        {
          json: {
            accounts: [
              {
                account_id: 'a1',
                name: 'Plaid Checking',
                mask: '0000',
                balances: { iso_currency_code: 'USD' },
              },
              { account_id: 'a2', name: '<b>Card</b>', balances: { iso_currency_code: null } },
            ],
            item: { institution_id: 'ins_1' },
          },
        },
      ]);
      const start = await plaid.createLink(
        PLAID,
        {
          userId: 'kd-1',
          webhook: 'https://app.example.com/api/webhooks/plaid?k=abc',
          countryCodes: ['US'],
        },
        f.transport,
      );
      assert.equal(start.url, 'https://secure.plaid.com/hl/abc');
      assert.equal(f.calls[0]?.url, 'https://sandbox.plaid.com/link/token/create');
      assert.equal(f.calls[0]?.headers['plaid-client-id'], PLAID.clientId);
      assert.equal(f.calls[0]?.headers['plaid-secret'], PLAID.secret);
      assert.ok(!String(f.calls[0]?.body).includes(PLAID.secret));
      const b = body(f.calls[0]);
      assert.deepEqual(b.products, ['transactions']);
      assert.deepEqual(b.hosted_link, {});
      assert.equal(b.webhook, 'https://app.example.com/api/webhooks/plaid?k=abc');
      assert.deepEqual(b.user, { client_user_id: 'kd-1' });
      assert.ok(String(b.client_name).length <= 30);
      await plaid.createLink(
        PLAID,
        {
          userId: 'kd-1',
          webhook: 'https://app.example.com/x',
          countryCodes: ['US'],
          accessToken: 'access-sandbox-1',
          redirectTo: 'https://app.example.com/integrations/bank',
        },
        f.transport,
      );
      const b2 = body(f.calls[1]);
      assert.equal(b2.access_token, 'access-sandbox-1');
      assert.equal(b2.products, undefined);
      assert.deepEqual(b2.hosted_link, {
        completion_redirect_uri: 'https://app.example.com/integrations/bank',
      });
      assert.deepEqual(await plaid.exchangePublicToken(PLAID, 'public-1', f.transport), {
        accessToken: 'access-sandbox-1',
        itemId: 'item-1',
      });
      assert.equal(f.calls[2]?.url, 'https://sandbox.plaid.com/item/public_token/exchange');
      const listing = await plaid.listAccounts(PLAID, 'access-sandbox-1', f.transport);
      assert.deepEqual(listing.accounts, [
        { id: 'a1', name: 'Plaid Checking', mask: '0000', currency: 'USD' },
        { id: 'a2', name: 'bCard/b', mask: null, currency: null },
      ]);
      const prod = fake([
        { json: { link_token: 'l', hosted_link_url: 'https://secure.plaid.com/hl/x' } },
      ]);
      await plaid.createLink(
        { ...PLAID, environment: 'production' },
        { userId: 'u', webhook: 'https://a.example.com/x', countryCodes: ['US'] },
        prod.transport,
      );
      assert.equal(prod.calls[0]?.url, 'https://production.plaid.com/link/token/create');
    },
  );

  await check(
    'Plaid sync: pages are followed with the cursor, added and modified go by account, the whole loop restarts on a mutation error',
    async () => {
      const page = (
        cursor: string,
        more: boolean,
        added: unknown[] = [],
        removed: unknown[] = [],
      ): { json: unknown } => ({
        json: { added, modified: [], removed, next_cursor: cursor, has_more: more },
      });
      const tx = (id: string, account: string): Record<string, unknown> => ({
        transaction_id: id,
        account_id: account,
      });
      const f = fake([
        page('c1', true, [tx('t1', 'a1')]),
        page('c2', false, [tx('t2', 'a1'), tx('t3', 'a2')], [{ transaction_id: 'old' }]),
      ]);
      const r = await plaid.syncTransactions(PLAID, 'access-1', '', f.transport);
      assert.equal(r.nextCursor, 'c2');
      assert.equal(r.removed, 1);
      assert.deepEqual([...r.byAccount.keys()], ['a1', 'a2']);
      assert.equal(r.byAccount.get('a1')?.length, 2);
      assert.equal(body(f.calls[0]).cursor, undefined);
      assert.equal(body(f.calls[1]).cursor, 'c1');
      assert.equal(body(f.calls[0]).count, 500);
      const again = fake([
        page('c1', true, [tx('t1', 'a1')]),
        {
          status: 400,
          json: {
            error_code: 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION',
            error_message: 'changed',
          },
        },
        page('c1', true, [tx('t1', 'a1')]),
        page('c2', false, [tx('t2', 'a1')]),
      ]);
      const r2 = await plaid.syncTransactions(PLAID, 'access-1', 'start', again.transport);
      assert.equal(r2.nextCursor, 'c2');
      assert.equal(r2.byAccount.get('a1')?.length, 2);
      assert.equal(body(again.calls[2]).cursor, 'start');
      const login = fake([
        {
          status: 400,
          json: { error_code: 'ITEM_LOGIN_REQUIRED', error_message: 'the login details changed' },
        },
      ]);
      await assert.rejects(
        plaid.syncTransactions(PLAID, 'access-1', '', login.transport),
        (e: unknown) =>
          e instanceof CommerceApiError &&
          /ITEM_LOGIN_REQUIRED/.test(e.message) &&
          !e.message.includes(PLAID.secret),
      );
    },
  );

  await check('Plaid: link result, item removal and the webhook key', async () => {
    const f = fake([
      {
        json: {
          link_sessions: [
            {
              finished_at: '2026-10-23T10:00:00Z',
              results: { item_add_results: [{ public_token: 'public-9' }] },
            },
          ],
        },
      },
      { json: { request_id: 'r' } },
      { json: { key: { alg: 'ES256', crv: 'P-256', kid: 'k1', kty: 'EC', x: 'a', y: 'b' } } },
    ]);
    assert.deepEqual(await plaid.readLinkResult(PLAID, 'link-1', f.transport), {
      finished: true,
      publicTokens: ['public-9'],
    });
    assert.equal(f.calls[0]?.url, 'https://sandbox.plaid.com/link/token/get');
    await plaid.removeItem(PLAID, 'access-1', f.transport);
    assert.equal(f.calls[1]?.url, 'https://sandbox.plaid.com/item/remove');
    const key = await plaid.webhookKey(PLAID, 'k1', f.transport);
    assert.equal(key.kid, 'k1');
    assert.equal(body(f.calls[2]).key_id, 'k1');
    const none = fake([{ json: {} }]);
    await assert.rejects(plaid.webhookKey(PLAID, 'k1', none.transport), CommerceApiError);
  });

  await check(
    'Salt Edge calls: App-id and Secret headers, the customer, connect and reconnect sessions with our reference, no signing without a key',
    async () => {
      const f = fake([
        { json: { data: { customer_id: '9001', identifier: 'kd-1' } } },
        {
          json: {
            data: {
              connect_url: 'https://www.saltedge.com/connect?token=abc',
              expires_at: '2026-10-24T00:00:00Z',
              customer_id: '9001',
            },
          },
        },
        {
          json: {
            data: {
              connect_url: 'https://www.saltedge.com/connect?token=def',
              expires_at: '2026-10-24T00:00:00Z',
              customer_id: '9001',
            },
          },
        },
        {
          json: {
            data: {
              id: '55',
              status: 'active',
              provider_name: 'Fake Bank',
              last_attempt: { fail_error_class: null },
            },
          },
        },
      ]);
      assert.equal(await saltedge.createCustomer(SE, 'kd-1', f.transport), '9001');
      assert.equal(f.calls[0]?.url, 'https://www.saltedge.com/api/v6/customers');
      assert.equal(f.calls[0]?.headers['app-id'], SE.appId);
      assert.equal(f.calls[0]?.headers.secret, SE.secret);
      assert.equal(f.calls[0]?.headers.signature, undefined);
      assert.deepEqual(body(f.calls[0]), { data: { identifier: 'kd-1' } });
      const link = await saltedge.connectSession(
        SE,
        {
          customerId: '9001',
          ref: 'link-1',
          returnTo: 'https://app.example.com/integrations/bank',
        },
        f.transport,
      );
      assert.equal(link.url, 'https://www.saltedge.com/connect?token=abc');
      const data = body(f.calls[1]).data as Record<string, unknown>;
      assert.equal(f.calls[1]?.url, 'https://www.saltedge.com/api/v6/connections/connect');
      assert.equal(data.customer_id, '9001');
      assert.deepEqual((data.consent as Record<string, unknown>).scopes, [
        'accounts',
        'transactions',
      ]);
      assert.deepEqual((data.attempt as Record<string, unknown>).custom_fields, { kd: 'link-1' });
      assert.equal(data.automatic_refresh, true);
      await saltedge.reconnectSession(
        SE,
        '55',
        { ref: 'link-1', returnTo: 'https://app.example.com/x' },
        f.transport,
      );
      assert.equal(f.calls[2]?.url, 'https://www.saltedge.com/api/v6/connections/55/reconnect');
      const shown = await saltedge.showConnection(SE, '55', f.transport);
      assert.deepEqual(shown, { status: 'active', providerName: 'Fake Bank', failClass: null });
      assert.equal(f.calls[3]?.method, 'GET');
      assert.equal(f.calls[3]?.body, undefined);
    },
  );

  await check(
    'Salt Edge signed requests carry Expires-at and Signature when the company gave a key',
    async () => {
      const { privateKey, publicKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' },
      });
      const f = fake([{ json: { data: { customer_id: '1' } } }]);
      await saltedge.createCustomer({ ...SE, privateKey }, 'kd-2', f.transport);
      const h = f.calls[0]?.headers ?? {};
      assert.match(h['expires-at'] ?? '', /^\d{10}$/);
      const text = `${h['expires-at']}|POST|https://www.saltedge.com/api/v6/customers|${f.calls[0]?.body}`;
      assert.equal(
        createVerify('SHA256')
          .update(text)
          .verify(publicKey, Buffer.from(h.signature ?? '', 'base64')),
        true,
      );
    },
  );

  await check(
    'Salt Edge lists: pages follow meta.next_id; accounts and transactions are read; a failure names its class and a rate limit is retried',
    async () => {
      const acc = (id: string): Record<string, unknown> => ({
        id,
        name: `Account ${id}`,
        currency_code: 'USD',
        extra: { account_number: '12345678' },
      });
      const f = fake([
        { json: { data: [acc('1'), acc('2')], meta: { next_id: '3' } } },
        { json: { data: [acc('3')], meta: { next_id: null } } },
      ]);
      const accounts = await saltedge.listAccounts(SE, '55', f.transport);
      assert.deepEqual(
        accounts.map((a) => [a.id, a.mask, a.currency]),
        [
          ['1', '5678', 'USD'],
          ['2', '5678', 'USD'],
          ['3', '5678', 'USD'],
        ],
      );
      assert.match(f.calls[0]?.url ?? '', /\/accounts\?connection_id=55&per_page=500$/);
      assert.match(f.calls[1]?.url ?? '', /from_id=3/);
      const t = fake([{ json: { data: [{ id: '10' }], meta: {} } }]);
      const list = await saltedge.listTransactions(SE, '55', '1', '9', t.transport);
      assert.equal(list.length, 1);
      assert.match(
        t.calls[0]?.url ?? '',
        /transactions\?connection_id=55&account_id=1&from_id=9&per_page=500/,
      );
      const bad = fake([
        {
          status: 404,
          json: {
            error: { class: 'ConnectionNotFound', message: 'No connection with this id.' },
          },
        },
      ]);
      await assert.rejects(
        saltedge.showConnection(SE, '404', bad.transport),
        (e: unknown) =>
          e instanceof CommerceApiError &&
          e.message.startsWith('ConnectionNotFound') &&
          e.retryable === false,
      );
      const limit = fake([
        { status: 429, json: { error: { class: 'RateLimitExceeded', message: 'slow down' } } },
      ]);
      await assert.rejects(
        saltedge.showConnection(SE, '1', limit.transport),
        (e: unknown) => e instanceof CommerceApiError && e.retryable,
      );
    },
  );

  process.stdout.write(`step16-bankfeed: ${checks} checks passed\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
