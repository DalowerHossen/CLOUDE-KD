// path: scripts/verify/step16-meta-connect.ts
// "Connect with Facebook": the login address, the one-use state tied to the owner, the two token exchanges and the Page list with a
// fake Facebook, the sealed pending list (names only reach the page), picking Pages and Instagram accounts, and that no user token
// or Page token is ever stored in clear or returned.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step16-meta-connect.ts
import { db } from './step10-flow-setup';
import './step16-meta-setup';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { registerService } from '@/lib/container';
import { loginUrl } from '@/lib/social/meta-oauth';
import {
  finishFacebookLogin,
  metaLoginAvailable,
  pendingChoices,
  saveChoices,
  startFacebookLogin,
} from '@/services/social/meta-connect';
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

const audits: string[] = [];
registerService('audit', {
  record: async (e: { action: string }) => void audits.push(e.action),
} as never);
registerService('encryption', {
  encrypt: async (_p: string, text: string) => ({
    v: Buffer.from(String(text)).toString('base64'),
  }),
  decrypt: async (_p: string, payload: { v: string }) => Buffer.from(payload.v, 'base64'),
} as never);

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
const SHORT = 'SHORT'.padEnd(40, 'x');
const LONG = 'LONGUSER'.padEnd(40, 'y');
const PAGE_TOKEN = 'PAGETOKEN'.padEnd(40, 'z');
const calls: string[] = [];

const fakeFacebook = async (url: string, init: RequestInit): Promise<Response> => {
  calls.push(url.replace(/(client_secret|code|fb_exchange_token)=[^&]+/g, '$1=***'));
  const u = new URL(url);
  const json = (b: unknown, status = 200): Response =>
    new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
  if (u.pathname.endsWith('/oauth/access_token')) {
    if (u.searchParams.get('code') === 'BADCODE0000')
      return json({ error: { message: 'bad', code: 100 } }, 400);
    if (u.searchParams.get('grant_type') === 'fb_exchange_token') {
      assert.equal(u.searchParams.get('fb_exchange_token'), SHORT);
      return json({ access_token: LONG, token_type: 'bearer', expires_in: 5183944 });
    }
    assert.equal(u.searchParams.get('client_id'), '1234567890');
    assert.equal(u.searchParams.get('client_secret'), 'S'.repeat(32));
    assert.equal(
      u.searchParams.get('redirect_uri'),
      'https://app.example.com/api/social/connect/facebook/callback',
    );
    return json({ access_token: SHORT, token_type: 'bearer', expires_in: 3600 });
  }
  if (u.pathname.endsWith('/me/accounts')) {
    assert.equal((init.headers as Record<string, string>).authorization, `Bearer ${LONG}`);
    return json({
      data: [
        {
          id: '111111111',
          name: 'Acme <b>Cafe</b>',
          access_token: PAGE_TOKEN,
          tasks: ['CREATE_CONTENT', 'MANAGE'],
          instagram_business_account: { id: '17841400000001', username: 'acmecafe' },
        },
        {
          id: '222222222',
          name: 'Read only',
          access_token: PAGE_TOKEN.replace('P', 'Q'),
          tasks: ['ANALYZE'],
        },
      ],
    });
  }
  return json({}, 404);
};

(async () => {
  await check(
    'the login address has the app, the exact callback, a state and the permissions',
    () => {
      const u = new URL(
        loginUrl(
          '1234567890',
          'https://app.example.com/api/social/connect/facebook/callback',
          'S'.repeat(40),
        ),
      );
      assert.equal(u.origin + u.pathname, 'https://www.facebook.com/v26.0/dialog/oauth');
      assert.equal(u.searchParams.get('response_type'), 'code');
      assert.ok(u.searchParams.get('scope')?.includes('pages_manage_posts'));
      assert.ok(u.searchParams.get('scope')?.includes('instagram_content_publish'));
      assert.equal(u.searchParams.get('state'), 'S'.repeat(40));
    },
  );

  let state = '';
  await check('starting makes a pending login that holds only the hash of the state', async () => {
    assert.equal(metaLoginAvailable(), true);
    const target = await startFacebookLogin(owner);
    state = new URL(target).searchParams.get('state') ?? '';
    assert.match(state, /^[A-Za-z0-9]{40}$/);
    const rows = db.rows('social_connect_sessions');
    assert.equal(rows.length, 1);
    assert.ok(!JSON.stringify(rows).includes(state));
    assert.match(String(rows[0]?.state_hash), /^[0-9a-f]{64}$/);
  });

  await check(
    'another owner, another company or a made-up state cannot finish the login',
    async () => {
      await assert.rejects(() =>
        finishFacebookLogin(
          { ...owner, userId: randomUUID() },
          { code: 'CODE123456789', state },
          fakeFacebook,
        ),
      );
      await assert.rejects(() =>
        finishFacebookLogin(
          { ...owner, companyId: randomUUID() },
          { code: 'CODE123456789', state },
          fakeFacebook,
        ),
      );
      await assert.rejects(() =>
        finishFacebookLogin(owner, { code: 'CODE123456789', state: 'A'.repeat(40) }, fakeFacebook),
      );
      assert.equal(calls.length, 0);
      assert.ok(!db.rows('social_connect_sessions')[0]?.used_at);
    },
  );

  let id = '';
  await check(
    'the owner finishes: code to short token to long token to Pages, and the list is stored sealed',
    async () => {
      id = await finishFacebookLogin(owner, { code: 'CODE123456789', state }, fakeFacebook);
      assert.equal(calls.length, 3);
      assert.ok(calls.every((c) => !c.includes('S'.repeat(32))));
      const stored = JSON.stringify(db.rows('social_connect_sessions'));
      for (const secret of [SHORT, LONG, PAGE_TOKEN])
        assert.ok(!stored.includes(secret), 'a token is stored in clear');
      assert.ok(audits.includes('social.facebook_login_done'));
    },
  );

  await check('the state works once', async () => {
    await assert.rejects(() =>
      finishFacebookLogin(owner, { code: 'CODE123456789', state }, fakeFacebook),
    );
    assert.equal(calls.length, 3);
  });

  await check('the page sees names only, never a token, and tags are stripped', async () => {
    const choices = await pendingChoices(owner, id);
    assert.equal(choices.length, 2);
    assert.equal(choices[0]?.name, 'Acme bCafe/b');
    assert.equal(choices[0]?.instagram?.username, 'acmecafe');
    assert.equal(choices[1]?.canPost, false);
    assert.ok(!JSON.stringify(choices).includes('TOKEN'));
    await assert.rejects(() => pendingChoices({ ...owner, userId: randomUUID() }, id));
  });

  await check(
    'picking connects the Page and the Instagram account with the Page token, and refuses what is not allowed',
    async () => {
      await assert.rejects(() => saveChoices(owner, id, []));
      await assert.rejects(() =>
        saveChoices(owner, id, [{ kind: 'facebook', pageId: '999999999' }]),
      );
      const done = await saveChoices(owner, id, [
        { kind: 'facebook', pageId: '111111111' },
        { kind: 'instagram', pageId: '111111111' },
        { kind: 'facebook', pageId: '222222222' },
        { kind: 'instagram', pageId: '222222222' },
      ]);
      assert.deepEqual(done.connected, ['Acme bCafe/b', '@acmecafe']);
      assert.equal(done.skipped.length, 2);
      const accounts = db.rows('social_accounts');
      assert.deepEqual(accounts.map((a) => [a.provider, a.external_id]).sort(), [
        ['facebook', '111111111'],
        ['instagram', '17841400000001'],
      ]);
      assert.ok(accounts.every((a) => a.token_expires_at === null));
      assert.ok(!JSON.stringify(accounts).includes(PAGE_TOKEN));
      assert.ok(audits.includes('social.facebook_connected'));
    },
  );

  await check('the pending list is gone after it is used', async () => {
    await assert.rejects(() => pendingChoices(owner, id));
    assert.equal(db.rows('social_connect_sessions')[0]?.data_enc, null);
  });

  await check('a refused code stops the login without a list', async () => {
    const target = await startFacebookLogin(owner);
    const s2 = new URL(target).searchParams.get('state') ?? '';
    await assert.rejects(() =>
      finishFacebookLogin(owner, { code: 'BADCODE0000', state: s2 }, fakeFacebook),
    );
  });

  process.stdout.write(`step16-meta-connect: ${checks} checks passed\n`);
})().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
});
