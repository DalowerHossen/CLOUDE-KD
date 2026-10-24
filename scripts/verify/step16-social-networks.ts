// path: scripts/verify/step16-social-networks.ts
// Logic checks of the LinkedIn, X, Telegram and Pinterest adapters (16.4.a2) with a fake fetch that follows the request shapes of
// the official documentation (docs/integrations/social-more.md): the address, where the token travels, the body, the answer that
// carries the post id, error handling (retryable or final), that the token is never in an error message, the rules of each
// network, the id shape of each account and the LinkedIn "little text" escaping. Live calls need real accounts.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step16-social-networks.ts
import assert from 'node:assert/strict';
import { linkedinAdapter } from '@/lib/social/adapters/linkedin';
import { pinterestAdapter } from '@/lib/social/adapters/pinterest';
import { telegramAdapter } from '@/lib/social/adapters/telegram';
import { xAdapter } from '@/lib/social/adapters/x';
import { SocialApiError } from '@/lib/social/graph';
import { accountInput, linkedinCommentary, pinTitle, problemsFor } from '@/lib/social/rules';

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

const TOKEN = 'SECRETTOKEN0123456789abcdef';
interface Call {
  url: string;
  init: RequestInit;
}
const fake = (
  answers: { status?: number; json: unknown; headers?: Record<string, string> }[],
): { calls: Call[]; fetcher: (u: string, i: RequestInit) => Promise<Response> } => {
  const calls: Call[] = [];
  let i = 0;
  return {
    calls,
    fetcher: async (url, init) => {
      calls.push({ url, init });
      const a = answers[Math.min(i, answers.length - 1)] ?? { json: {} };
      i += 1;
      return new Response(JSON.stringify(a.json), {
        status: a.status ?? 200,
        headers: { 'content-type': 'application/json', ...(a.headers ?? {}) },
      });
    },
  };
};
const hdr = (c: Call | undefined, name: string): string | undefined =>
  (c?.init.headers as Record<string, string> | undefined)?.[name];
const body = (c: Call | undefined): Record<string, unknown> =>
  JSON.parse(String(c?.init.body)) as Record<string, unknown>;
const post = (
  b: string,
  link: string | null = null,
  image: string | null = null,
): { body: string; linkUrl: string | null; imageUrl: string | null } => ({
  body: b,
  linkUrl: link,
  imageUrl: image,
});

async function main(): Promise<void> {
  await check(
    'X: POST /2/tweets with a Bearer token and { text }; the id comes from data.id',
    async () => {
      const f = fake([{ status: 201, json: { data: { id: '1346889436626259968', text: 'Hi' } } }]);
      const r = await xAdapter.publish(
        { provider: 'x', externalId: '99', token: TOKEN },
        post('Hi', 'https://example.com/a'),
        f.fetcher,
      );
      assert.deepEqual(r, { state: 'published', externalId: '1346889436626259968', url: null });
      assert.equal(f.calls[0]?.url, 'https://api.x.com/2/tweets');
      assert.equal(hdr(f.calls[0], 'authorization'), `Bearer ${TOKEN}`);
      assert.deepEqual(body(f.calls[0]), { text: 'Hi\nhttps://example.com/a' });
      assert.ok(!f.calls[0]?.url.includes(TOKEN));
    },
  );

  await check('X: check reads /2/users/me and refuses a token of another account', async () => {
    const ok = fake([{ json: { data: { id: '99', name: 'KD', username: 'kd_it' } } }]);
    const r = await xAdapter.check!({ provider: 'x', externalId: '99', token: TOKEN }, ok.fetcher);
    assert.equal(r.name, 'kd_it');
    assert.equal(ok.calls[0]?.url, 'https://api.x.com/2/users/me');
    const other = fake([{ json: { data: { id: '5', name: 'A', username: 'a' } } }]);
    await assert.rejects(
      xAdapter.check!({ provider: 'x', externalId: '99', token: TOKEN }, other.fetcher),
      SocialApiError,
    );
  });

  await check(
    'X: 429 is retryable, 403 is final, and the token is never in the message',
    async () => {
      for (const [status, retry] of [
        [429, true],
        [403, false],
        [503, true],
      ] as const) {
        const f = fake([{ status, json: { title: 'Nope', detail: `bad ${status}`, status } }]);
        try {
          await xAdapter.publish(
            { provider: 'x', externalId: '99', token: TOKEN },
            post('Hi'),
            f.fetcher,
          );
          assert.fail('must throw');
        } catch (e) {
          assert.ok(e instanceof SocialApiError);
          assert.equal(e.retryable, retry);
          assert.ok(!e.message.includes(TOKEN));
        }
      }
    },
  );

  await check(
    'LinkedIn: POST /rest/posts with the version headers; the id is the x-restli-id header',
    async () => {
      const f = fake([
        { status: 201, json: {}, headers: { 'x-restli-id': 'urn:li:share:684478' } },
      ]);
      const r = await linkedinAdapter.publish(
        { provider: 'linkedin', externalId: 'urn:li:organization:5515715', token: TOKEN },
        post('Hello #launch'),
        f.fetcher,
      );
      assert.deepEqual(r, { state: 'published', externalId: 'urn:li:share:684478', url: null });
      assert.equal(f.calls[0]?.url, 'https://api.linkedin.com/rest/posts');
      assert.equal(hdr(f.calls[0], 'authorization'), `Bearer ${TOKEN}`);
      assert.equal(hdr(f.calls[0], 'x-restli-protocol-version'), '2.0.0');
      assert.match(hdr(f.calls[0], 'linkedin-version') ?? '', /^\d{6}$/);
      const b = body(f.calls[0]);
      assert.equal(b.author, 'urn:li:organization:5515715');
      assert.equal(b.visibility, 'PUBLIC');
      assert.equal(b.lifecycleState, 'PUBLISHED');
      assert.equal(b.commentary, 'Hello {hashtag|\\#|launch}');
      assert.deepEqual(b.distribution, {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      });
      const none = fake([{ status: 201, json: {} }]);
      await assert.rejects(
        linkedinAdapter.publish(
          { provider: 'linkedin', externalId: 'urn:li:person:abc', token: TOKEN },
          post('Hi'),
          none.fetcher,
        ),
        SocialApiError,
      );
    },
  );

  await check('LinkedIn: every reserved character is escaped; hashtags stay hashtags', () => {
    assert.equal(
      linkedinCommentary('a_b *c* (d) [e] {f} <g> @h | ~ \\'),
      'a\\_b \\*c\\* \\(d\\) \\[e\\] \\{f\\} \\<g\\> \\@h \\| \\~ \\\\',
    );
    assert.equal(
      linkedinCommentary('#one and #two_x.'),
      '{hashtag|\\#|one} and {hashtag|\\#|two_x}.',
    );
    assert.equal(linkedinCommentary('No tags'), 'No tags');
    assert.equal(linkedinCommentary('a#b'), 'a\\#b');
  });

  await check(
    'Telegram: the token is in the address path; text goes to sendMessage, a photo to sendPhoto',
    async () => {
      const f = fake([
        { json: { ok: true, result: { message_id: 42, chat: { id: -1001234567890 } } } },
        { json: { ok: true, result: { message_id: 43 } } },
      ]);
      const acct = {
        provider: 'telegram' as const,
        externalId: '-1001234567890',
        token: '123456:ABC-DEF1234ghIkl',
      };
      const r = await telegramAdapter.publish(
        acct,
        post('Hello', 'https://example.com'),
        f.fetcher,
      );
      assert.deepEqual(r, { state: 'published', externalId: '42', url: null });
      assert.equal(
        f.calls[0]?.url,
        'https://api.telegram.org/bot123456:ABC-DEF1234ghIkl/sendMessage',
      );
      assert.deepEqual(body(f.calls[0]), {
        chat_id: -1001234567890,
        text: 'Hello\nhttps://example.com',
      });
      await telegramAdapter.publish(
        { ...acct, externalId: '@kd_channel' },
        post('Look', null, 'https://example.com/a.jpg'),
        f.fetcher,
      );
      assert.equal(
        f.calls[1]?.url,
        'https://api.telegram.org/bot123456:ABC-DEF1234ghIkl/sendPhoto',
      );
      assert.deepEqual(body(f.calls[1]), {
        chat_id: '@kd_channel',
        photo: 'https://example.com/a.jpg',
        caption: 'Look',
      });
    },
  );

  await check(
    'Telegram: ok false is a failure; 429 is retryable; the token is not in the message',
    async () => {
      const acct = {
        provider: 'telegram' as const,
        externalId: '-100123',
        token: '123456:ABC-DEF1234ghIkl',
      };
      const bad = fake([
        {
          status: 400,
          json: { ok: false, error_code: 400, description: 'Bad Request: chat not found' },
        },
      ]);
      try {
        await telegramAdapter.publish(acct, post('Hi'), bad.fetcher);
        assert.fail('must throw');
      } catch (e) {
        assert.ok(e instanceof SocialApiError);
        assert.equal(e.retryable, false);
        assert.ok(!e.message.includes('ABC-DEF'));
      }
      const flood = fake([
        {
          status: 429,
          json: {
            ok: false,
            error_code: 429,
            description: 'Too Many Requests: retry after 5',
            parameters: { retry_after: 5 },
          },
        },
      ]);
      await assert.rejects(
        telegramAdapter.publish(acct, post('Hi'), flood.fetcher),
        (e: unknown) => e instanceof SocialApiError && e.retryable,
      );
      const soft = fake([{ json: { ok: false, description: 'nope' } }]);
      await assert.rejects(telegramAdapter.publish(acct, post('Hi'), soft.fetcher), SocialApiError);
      const chat = fake([
        { json: { ok: true, result: { id: -100123, title: 'KD News', type: 'channel' } } },
      ]);
      assert.equal((await telegramAdapter.check!(acct, chat.fetcher)).name, 'KD News');
      assert.match(chat.calls[0]?.url ?? '', /\/getChat$/);
    },
  );

  await check(
    'Pinterest: POST /v5/pins with board_id and an image_url media source; check reads the board',
    async () => {
      const f = fake([
        { status: 201, json: { id: '813744226420795884' } },
        { json: { id: '549755885175', name: 'Ideas' } },
      ]);
      const acct = { provider: 'pinterest' as const, externalId: '549755885175', token: TOKEN };
      const r = await pinterestAdapter.publish(
        acct,
        post(
          'Summer table\nA longer description',
          'https://example.com/p',
          'https://example.com/a.jpg',
        ),
        f.fetcher,
      );
      assert.deepEqual(r, { state: 'published', externalId: '813744226420795884', url: null });
      assert.equal(f.calls[0]?.url, 'https://api.pinterest.com/v5/pins');
      assert.equal(hdr(f.calls[0], 'authorization'), `Bearer ${TOKEN}`);
      assert.deepEqual(body(f.calls[0]), {
        board_id: '549755885175',
        media_source: { source_type: 'image_url', url: 'https://example.com/a.jpg' },
        title: 'Summer table',
        description: 'Summer table\nA longer description',
        link: 'https://example.com/p',
      });
      assert.equal((await pinterestAdapter.check!(acct, f.fetcher)).name, 'Ideas');
      assert.equal(f.calls[1]?.url, 'https://api.pinterest.com/v5/boards/549755885175');
      await assert.rejects(
        pinterestAdapter.publish(acct, post('No image'), f.fetcher),
        SocialApiError,
      );
      assert.equal(pinTitle('x'.repeat(150)).length, 100);
    },
  );

  await check('rules: the limits and requirements of each network', () => {
    assert.equal(problemsFor('x', post('x'.repeat(280))).length, 0);
    assert.equal(problemsFor('x', post('x'.repeat(281))).length, 1);
    assert.equal(problemsFor('x', post('', 'https://example.com')).length, 0);
    assert.equal(problemsFor('x', post('Hi', null, 'https://example.com/a.jpg')).length, 1);
    assert.equal(problemsFor('linkedin', post('')).length, 1);
    assert.equal(problemsFor('linkedin', post('Hi')).length, 0);
    assert.equal(problemsFor('linkedin', post('Hi', null, 'https://example.com/a.jpg')).length, 1);
    assert.equal(problemsFor('telegram', post('x'.repeat(4096))).length, 0);
    assert.equal(problemsFor('telegram', post('x'.repeat(4097))).length, 1);
    assert.equal(
      problemsFor('telegram', post('x'.repeat(1025), null, 'https://example.com/a.jpg')).length,
      1,
    );
    assert.equal(problemsFor('telegram', post('')).length, 1);
    assert.equal(problemsFor('pinterest', post('Hi')).length, 1);
    assert.equal(problemsFor('pinterest', post('Hi', null, 'https://example.com/a.jpg')).length, 0);
    assert.equal(
      problemsFor('pinterest', post('x'.repeat(801), null, 'https://example.com/a.jpg')).length,
      1,
    );
  });

  await check('inputs: each network accepts the id shape it uses and refuses the others', () => {
    const base = { displayName: 'Acct', accessToken: TOKEN };
    const ok = (provider: string, externalId: string): boolean =>
      accountInput.safeParse({ ...base, provider, externalId }).success;
    assert.ok(ok('linkedin', 'urn:li:organization:5515715'));
    assert.ok(ok('linkedin', 'urn:li:person:AbC-123_x'));
    assert.ok(!ok('linkedin', '5515715'));
    assert.ok(!ok('linkedin', 'urn:li:organization:../x'));
    assert.ok(ok('x', '1880028106020515840'));
    assert.ok(!ok('x', 'someone'));
    assert.ok(ok('telegram', '-1001234567890'));
    assert.ok(ok('telegram', '@kd_channel'));
    assert.ok(!ok('telegram', 'kd_channel'));
    assert.ok(!ok('telegram', '@ab'));
    assert.ok(ok('pinterest', '549755885175'));
    assert.ok(!ok('pinterest', 'board-1'));
    assert.ok(ok('facebook', '102290129340398'));
    assert.ok(!ok('facebook', 'urn:li:person:1'));
    assert.ok(
      !accountInput.safeParse({ displayName: 'A', provider: 'x', externalId: '1' }).success,
    );
  });

  process.stdout.write(`step16-social-networks: ${checks} checks passed\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
