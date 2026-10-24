// path: scripts/verify/step16-social.ts
// Logic checks of social media (16.4.a) that need no database or network: counting text, hashtags and mentions as each network
// does, the checks each network makes on a post, adding a hashtag group, the daily limits, the inputs, and the Facebook, Instagram,
// Threads and sandbox adapters with a fake fetch using the request shapes of the Meta documentation (docs/integrations/social.md):
// where the token travels, the form or JSON body, the container steps, error handling (retryable or final) and that the token is
// never in an error message. The tables and the post status guard are tested in sql/assertions/s16_005_social.sql. Calls to the
// networks, the cron publishing and the pages need a running app and real accounts.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step16-social.ts
import assert from 'node:assert/strict';
import { facebookAdapter } from '@/lib/social/adapters/facebook';
import { instagramAdapter } from '@/lib/social/adapters/instagram';
import { sandboxAdapter } from '@/lib/social/adapters/sandbox';
import { threadsAdapter } from '@/lib/social/adapters/threads';
import { graph, SocialApiError } from '@/lib/social/graph';
import { adapterFor } from '@/lib/social/registry';
import {
  accountInput,
  charCount,
  countHashtags,
  countMentions,
  dailyLimitOf,
  facebookPostUrl,
  hashtagGroupInput,
  normaliseTag,
  postInput,
  postUpdate,
  problemsFor,
  threadsLength,
  threadsTopicTag,
  tokenExpiresSoon,
  withHashtags,
  withinDailyLimit,
} from '@/lib/social/rules';
import { SOCIAL_PROVIDERS } from '@/config/s16-social';

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

const EMOJI = String.fromCodePoint(0x1f600);
const TOKEN = 'EAAJBsocialsecrettoken0123456789';
const A = '11111111-1111-4111-8111-111111111111';
interface Call {
  url: string;
  init: RequestInit;
}
const fake = (
  answers: { status?: number; json: unknown }[],
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
        headers: { 'content-type': 'application/json' },
      });
    },
  };
};
const hdr = (c: Call | undefined, name: string): string | undefined =>
  (c?.init.headers as Record<string, string> | undefined)?.[name];

async function main(): Promise<void> {
  await check(
    'counting: hashtags and mentions ignore e-mail addresses and entities; emoji count as UTF-8 bytes on Threads',
    () => {
      assert.equal(countHashtags('Big news #launch and #new_year! Not a#tag. &#39; #'), 2);
      assert.equal(
        countHashtags(`#${String.fromCodePoint(0xdc)}n${String.fromCodePoint(0xef)}code works`),
        1,
      );
      assert.equal(countMentions('Thanks @natgeo and @my.shop, mail me@example.com'), 2);
      assert.equal(charCount(`ab${EMOJI}`), 3);
      assert.equal(threadsLength('ab'), 2);
      assert.equal(threadsLength(EMOJI), 4);
      assert.equal(threadsLength(String.fromCodePoint(0xe9)), 1);
    },
  );

  await check('hashtag groups are added once on a new line', () => {
    assert.equal(withHashtags('Hello', ['launch', '#new']), 'Hello\n\n#launch #new');
    assert.equal(withHashtags('Hello #launch', ['launch', 'new']), 'Hello #launch\n\n#new');
    assert.equal(withHashtags('Hello #LAUNCH', ['launch']), 'Hello #LAUNCH');
    assert.equal(withHashtags('', ['a']), '#a');
    assert.equal(normaliseTag(' #x '), '#x');
  });

  await check(
    'Instagram rules: image needed, JPEG only, caption 2200, 30 hashtags, 20 mentions, no link',
    () => {
      const ok = { body: 'Hi', linkUrl: null, imageUrl: 'https://cdn.example.com/a.jpg' };
      assert.deepEqual(problemsFor('instagram', ok), []);
      assert.equal(problemsFor('instagram', { ...ok, imageUrl: null }).length, 1);
      assert.match(
        problemsFor('instagram', { ...ok, imageUrl: 'https://cdn.example.com/a.png' })[0] ?? '',
        /JPEG/,
      );
      assert.equal(
        problemsFor('instagram', { ...ok, imageUrl: 'https://cdn.example.com/a.JPEG?v=1' }).length,
        0,
      );
      assert.equal(problemsFor('instagram', { ...ok, body: 'x'.repeat(2201) }).length, 1);
      assert.equal(
        problemsFor('instagram', {
          ...ok,
          body: Array.from({ length: 31 }, (_, i) => `#t${i}`).join(' '),
        }).length,
        1,
      );
      assert.equal(
        problemsFor('instagram', {
          ...ok,
          body: Array.from({ length: 21 }, (_, i) => `@u${i}`).join(' '),
        }).length,
        1,
      );
      assert.equal(problemsFor('instagram', { ...ok, linkUrl: 'https://example.com' }).length, 1);
    },
  );

  await check(
    'Threads rules: 500 characters with emoji as bytes, text or image, link in the text',
    () => {
      assert.deepEqual(
        problemsFor('threads', { body: 'x'.repeat(500), linkUrl: null, imageUrl: null }),
        [],
      );
      assert.equal(
        problemsFor('threads', { body: 'x'.repeat(501), linkUrl: null, imageUrl: null }).length,
        1,
      );
      assert.equal(
        problemsFor('threads', {
          body: `${'x'.repeat(497)}${EMOJI}`,
          linkUrl: null,
          imageUrl: null,
        }).length,
        1,
      );
      assert.equal(problemsFor('threads', { body: '', linkUrl: null, imageUrl: null }).length, 1);
      assert.equal(
        problemsFor('threads', { body: 'Hi', linkUrl: 'https://example.com', imageUrl: null })
          .length,
        1,
      );
    },
  );

  await check('Facebook and sandbox rules', () => {
    assert.deepEqual(
      problemsFor('facebook', { body: 'Hi', linkUrl: 'https://example.com', imageUrl: null }),
      [],
    );
    assert.equal(problemsFor('facebook', { body: '', linkUrl: null, imageUrl: null }).length, 1);
    assert.equal(
      problemsFor('facebook', {
        body: 'Hi',
        linkUrl: 'https://example.com',
        imageUrl: 'https://example.com/a.jpg',
      }).length,
      1,
    );
    assert.deepEqual(problemsFor('sandbox', { body: 'Hi', linkUrl: null, imageUrl: null }), []);
  });

  await check('Threads topic tag comes from the first hashtag when it fits', () => {
    assert.equal(threadsTopicTag('Hello #launch more #other'), 'launch');
    assert.equal(threadsTopicTag('No tags'), null);
    assert.equal(threadsTopicTag(`#${'a'.repeat(51)}`), null);
  });

  await check(
    'daily limits: Instagram 50 (the lower of the two figures read), Threads 250, others none',
    () => {
      assert.equal(dailyLimitOf('instagram'), 50);
      assert.equal(dailyLimitOf('threads'), 250);
      assert.equal(dailyLimitOf('facebook'), null);
      assert.ok(withinDailyLimit('instagram', 49));
      assert.ok(!withinDailyLimit('instagram', 50));
      assert.ok(withinDailyLimit('facebook', 100000));
      assert.ok(tokenExpiresSoon('2026-06-10T00:00:00Z', new Date('2026-06-05T00:00:00Z'), 7));
      assert.ok(!tokenExpiresSoon('2026-08-10T00:00:00Z', new Date('2026-06-05T00:00:00Z'), 7));
      assert.ok(!tokenExpiresSoon(null, new Date(), 7));
      assert.equal(facebookPostUrl('1_2'), 'https://www.facebook.com/1_2');
    },
  );

  await check(
    'inputs: a network account needs a token, a sandbox account has none, posts need text or an image and https',
    () => {
      const base = { displayName: 'My Page', externalId: '102290129340398' };
      assert.ok(
        accountInput.safeParse({ ...base, provider: 'facebook', accessToken: TOKEN }).success,
      );
      assert.ok(!accountInput.safeParse({ ...base, provider: 'facebook' }).success);
      assert.ok(
        !accountInput.safeParse({ ...base, provider: 'sandbox', accessToken: TOKEN }).success,
      );
      assert.ok(accountInput.safeParse({ ...base, provider: 'sandbox' }).success);
      assert.ok(
        !accountInput.safeParse({ ...base, provider: 'linkedin', accessToken: TOKEN }).success,
      );
      assert.ok(
        !accountInput.safeParse({ ...base, provider: 'facebook', accessToken: 'short' }).success,
      );
      assert.ok(
        !accountInput.safeParse({ ...base, displayName: '<b>', provider: 'sandbox' }).success,
      );
      assert.ok(
        !accountInput.safeParse({ ...base, externalId: 'a b', provider: 'sandbox' }).success,
      );
      assert.ok(postInput.safeParse({ accountId: A, body: 'Hi' }).success);
      assert.ok(
        postInput.safeParse({ accountId: A, imageUrl: 'https://cdn.example.com/a.jpg' }).success,
      );
      assert.ok(!postInput.safeParse({ accountId: A }).success);
      assert.ok(
        !postInput.safeParse({ accountId: A, body: 'Hi', linkUrl: 'http://example.com' }).success,
      );
      assert.ok(
        !postInput.safeParse({
          accountId: A,
          body: 'Hi',
          imageUrl: 'https://user:pw@example.com/a.jpg',
        }).success,
      );
      assert.ok(!postInput.safeParse({ accountId: A, body: '<script>' }).success);
      assert.ok(!postInput.safeParse({ accountId: A, body: 'Hi', status: 'published' }).success);
      assert.ok(!postUpdate.safeParse({ body: 'x' }).success);
      assert.ok(hashtagGroupInput.safeParse({ name: 'Launch', tags: ['launch', '#new'] }).success);
      assert.ok(!hashtagGroupInput.safeParse({ name: 'Launch', tags: [] }).success);
      assert.ok(!hashtagGroupInput.safeParse({ name: 'Launch', tags: ['a b'] }).success);
      assert.deepEqual(
        [...SOCIAL_PROVIDERS],
        ['facebook', 'instagram', 'threads', 'linkedin', 'x', 'telegram', 'pinterest', 'sandbox'],
      );
    },
  );

  await check('registry: every network has an adapter', () => {
    for (const p of SOCIAL_PROVIDERS) assert.equal(adapterFor(p).id, p);
    assert.equal(adapterFor('facebook'), facebookAdapter);
  });

  await check(
    'graph helper: a read keeps the token out of the address; errors never contain the token',
    async () => {
      const f = fake([{ json: { name: 'x' } }]);
      await graph(
        {
          base: 'https://graph.facebook.com/v26.0',
          path: 'p1',
          method: 'GET',
          token: TOKEN,
          tokenIn: 'bearer',
          params: { fields: 'name' },
        },
        f.fetcher,
      );
      assert.ok(!(f.calls[0]?.url ?? '').includes(TOKEN));
      assert.equal(f.calls[0]?.url, 'https://graph.facebook.com/v26.0/p1?fields=name');
      assert.equal(hdr(f.calls[0], 'authorization'), `Bearer ${TOKEN}`);
      const bad = fake([
        {
          status: 400,
          json: {
            error: {
              message: `bad ${TOKEN}`,
              code: 190,
              error_data: { details: 'Token is invalid' },
            },
          },
        },
      ]);
      await assert.rejects(
        graph({ base: 'b', path: 'p', method: 'POST', token: TOKEN, tokenIn: 'body' }, bad.fetcher),
        (e: unknown) =>
          e instanceof SocialApiError && !e.message.includes(TOKEN) && e.retryable === false,
      );
      await assert.rejects(
        graph({ base: 'b', path: 'p', method: 'POST', token: TOKEN, tokenIn: 'body' }, async () => {
          throw new Error(TOKEN);
        }),
        (e: unknown) => e instanceof SocialApiError && e.retryable && !e.message.includes(TOKEN),
      );
      const limited = fake([{ status: 429, json: { error: { message: 'slow down', code: 4 } } }]);
      await assert.rejects(
        graph(
          { base: 'b', path: 'p', method: 'POST', token: TOKEN, tokenIn: 'body' },
          limited.fetcher,
        ),
        (e: unknown) => e instanceof SocialApiError && e.retryable,
      );
    },
  );

  await check(
    'Facebook: a text post goes to /feed with the token in the JSON body; a photo to /photos; the permalink is built',
    async () => {
      const f = fake([{ json: { id: '1_2' } }, { json: { id: '3', post_id: '1_4' } }]);
      const acct = { provider: 'facebook' as const, externalId: '102290129340398', token: TOKEN };
      const text = await facebookAdapter.publish(
        acct,
        { body: 'Hello', linkUrl: 'https://example.com', imageUrl: null },
        f.fetcher,
      );
      assert.deepEqual(text, {
        state: 'published',
        externalId: '1_2',
        url: 'https://www.facebook.com/1_2',
      });
      assert.equal(f.calls[0]?.url, 'https://graph.facebook.com/v26.0/102290129340398/feed');
      assert.deepEqual(JSON.parse(String(f.calls[0]?.init.body)), {
        message: 'Hello',
        link: 'https://example.com',
        access_token: TOKEN,
      });
      assert.equal(hdr(f.calls[0], 'content-type'), 'application/json');
      const photo = await facebookAdapter.publish(
        acct,
        { body: 'Look', linkUrl: null, imageUrl: 'https://cdn.example.com/a.jpg' },
        f.fetcher,
      );
      assert.equal(photo.state === 'published' && photo.externalId, '1_4');
      assert.equal(f.calls[1]?.url, 'https://graph.facebook.com/v26.0/102290129340398/photos');
      assert.deepEqual(JSON.parse(String(f.calls[1]?.init.body)), {
        url: 'https://cdn.example.com/a.jpg',
        message: 'Look',
        access_token: TOKEN,
      });
    },
  );

  await check(
    'Instagram: container with the image address and caption, status read, then media_publish with the container id',
    async () => {
      const f = fake([
        { json: { id: 'C1' } },
        { json: { status_code: 'FINISHED', id: 'C1' } },
        { json: { status_code: 'FINISHED' } },
        { json: { id: 'M1' } },
      ]);
      const acct = {
        provider: 'instagram' as const,
        externalId: '17841400000000000',
        token: TOKEN,
      };
      const r = await instagramAdapter.publish(
        acct,
        { body: 'Fruit candies #sweet', linkUrl: null, imageUrl: 'https://cdn.example.com/a.jpg' },
        f.fetcher,
      );
      assert.deepEqual(r, { state: 'published', externalId: 'M1', url: null });
      assert.equal(f.calls[0]?.url, 'https://graph.facebook.com/v26.0/17841400000000000/media');
      assert.deepEqual(JSON.parse(String(f.calls[0]?.init.body)), {
        image_url: 'https://cdn.example.com/a.jpg',
        caption: 'Fruit candies #sweet',
      });
      assert.equal(hdr(f.calls[0], 'authorization'), `Bearer ${TOKEN}`);
      assert.ok(!String(f.calls[0]?.init.body).includes(TOKEN));
      assert.equal(f.calls[1]?.url, 'https://graph.facebook.com/v26.0/C1?fields=status_code');
      assert.equal(
        f.calls[3]?.url,
        'https://graph.facebook.com/v26.0/17841400000000000/media_publish',
      );
      assert.deepEqual(JSON.parse(String(f.calls[3]?.init.body)), { creation_id: 'C1' });
    },
  );

  await check(
    'Instagram: an ERROR container is a final failure, an IN_PROGRESS one on finish is a later retry',
    async () => {
      const acct = {
        provider: 'instagram' as const,
        externalId: '17841400000000000',
        token: TOKEN,
      };
      const post = { body: 'x', linkUrl: null, imageUrl: 'https://cdn.example.com/a.jpg' };
      const err = fake([{ json: { id: 'C2' } }, { json: { status_code: 'ERROR' } }]);
      await assert.rejects(
        instagramAdapter.publish(acct, post, err.fetcher),
        (e: unknown) => e instanceof SocialApiError && !e.retryable,
      );
      const slow = fake([{ json: { status_code: 'IN_PROGRESS' } }]);
      await assert.rejects(
        instagramAdapter.finish!(acct, 'C3', slow.fetcher),
        (e: unknown) => e instanceof SocialApiError && e.retryable,
      );
      await assert.rejects(
        instagramAdapter.publish(acct, { ...post, imageUrl: null }),
        SocialApiError,
      );
    },
  );

  await check(
    'Threads: a form request to /threads makes a TEXT container, 30 seconds later /threads_publish with creation_id',
    async () => {
      const f = fake([{ json: { id: 'T1' } }, { json: { id: 'P1' } }]);
      const acct = { provider: 'threads' as const, externalId: '1234567890', token: TOKEN };
      const r = await threadsAdapter.publish(
        acct,
        { body: 'Hello #launch', linkUrl: null, imageUrl: null },
        f.fetcher,
      );
      assert.deepEqual(r, { state: 'pending', containerId: 'T1', publishAfterSeconds: 30 });
      assert.equal(f.calls[0]?.url, 'https://graph.threads.com/v1.0/1234567890/threads');
      assert.equal(hdr(f.calls[0], 'content-type'), 'application/x-www-form-urlencoded');
      const form = new URLSearchParams(String(f.calls[0]?.init.body));
      assert.equal(form.get('media_type'), 'TEXT');
      assert.equal(form.get('text'), 'Hello #launch');
      assert.equal(form.get('topic_tag'), 'launch');
      assert.equal(form.get('access_token'), TOKEN);
      const done = await threadsAdapter.finish!(acct, 'T1', f.fetcher);
      assert.deepEqual(done, { state: 'published', externalId: 'P1', url: null });
      assert.equal(f.calls[1]?.url, 'https://graph.threads.com/v1.0/1234567890/threads_publish');
      assert.equal(new URLSearchParams(String(f.calls[1]?.init.body)).get('creation_id'), 'T1');
      const img = fake([{ json: { id: 'T2' } }]);
      await threadsAdapter.publish(
        acct,
        { body: '', linkUrl: null, imageUrl: 'https://cdn.example.com/a.jpg' },
        img.fetcher,
      );
      const imgForm = new URLSearchParams(String(img.calls[0]?.init.body));
      assert.equal(imgForm.get('media_type'), 'IMAGE');
      assert.equal(imgForm.get('image_url'), 'https://cdn.example.com/a.jpg');
      assert.equal(imgForm.get('text'), null);
    },
  );

  await check('sandbox: publishes at once with a made-up id and calls nothing', async () => {
    const r = await sandboxAdapter.publish(
      { provider: 'sandbox', externalId: 's', token: '' },
      { body: 'x', linkUrl: null, imageUrl: null },
    );
    assert.equal(r.state, 'published');
    assert.match(r.state === 'published' ? r.externalId : '', /^sandbox\./);
  });

  process.stdout.write(`step16-social: ${checks} checks passed\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
