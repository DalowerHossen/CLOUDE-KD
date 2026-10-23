// path: scripts/verify/step16-social-schedule.ts
// Logic checks of 16.4.b that need no database or network: time zone arithmetic (a fixed offset, a half hour offset, a clock change),
// the posting slots of a schedule, the evergreen order, text variants and due time, rule templates, the tracked link helpers, the
// analytics helpers (best hours, period comparison, top posts, engagement rate, the Threads insights shape), the strict inputs, and
// the Threads insights request with a fake fetch (the request shape is from docs/integrations/social.md, "Threads insights").
// The tables, the approval guard and the click counter are tested in sql/assertions/s16_006_social_schedule.sql. The services,
// the cron jobs, the pages and calls to a network need a running app and real accounts.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step16-social-schedule.ts
import assert from 'node:assert/strict';
import { threadsAdapter } from '@/lib/social/adapters/threads';
import { bestHours, compare, engagementRate, metricsOf, topPosts } from '@/lib/social/analytics';
import { renderTemplate, unknownTokens } from '@/lib/social/automation';
import {
  codeFromBytes,
  isTracked,
  LINK_CODE,
  replaceUrls,
  trackedUrl,
  urlsIn,
} from '@/lib/social/links';
import { effectiveLimit, withinDailyLimit } from '@/lib/social/rules';
import {
  addDays,
  decisionInput,
  evergreenDue,
  evergreenItemInput,
  evergreenPlanInput,
  fireInput,
  isTimeZone,
  localDay,
  localHour,
  queueLow,
  rankEvergreen,
  ruleInput,
  scheduleInput,
  scheduleUpdate,
  settingsInput,
  slotsFor,
  variantFor,
  weekdayOf,
  zonedToUtc,
} from '@/lib/social/schedule';

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

const A = '11111111-1111-4111-8111-111111111111';
const iso = (d: Date): string => d.toISOString();

async function main(): Promise<void> {
  await check('time zones: a fixed offset, a half hour offset and a clock change', () => {
    assert.equal(isTimeZone('Asia/Dhaka'), true);
    assert.equal(isTimeZone('Mars/Olympus'), false);
    assert.equal(iso(zonedToUtc('2026-03-02', '09:30', 'Asia/Dhaka')), '2026-03-02T03:30:00.000Z');
    assert.equal(
      iso(zonedToUtc('2026-03-02', '09:30', 'Asia/Kolkata')),
      '2026-03-02T04:00:00.000Z',
    );
    assert.equal(
      iso(zonedToUtc('2026-01-15', '08:00', 'America/New_York')),
      '2026-01-15T13:00:00.000Z',
    );
    assert.equal(
      iso(zonedToUtc('2026-07-15', '08:00', 'America/New_York')),
      '2026-07-15T12:00:00.000Z',
    );
    // Day of the clock change in New York (spring forward on 2026-03-08): 09:00 local is already summer time.
    assert.equal(
      iso(zonedToUtc('2026-03-08', '09:00', 'America/New_York')),
      '2026-03-08T13:00:00.000Z',
    );
    assert.equal(iso(zonedToUtc('2026-03-02', '23:59', 'UTC')), '2026-03-02T23:59:00.000Z');
    assert.equal(localDay(new Date('2026-03-02T20:30:00Z'), 'Asia/Dhaka'), '2026-03-03');
    assert.equal(localHour(new Date('2026-03-02T20:30:00Z'), 'Asia/Dhaka'), 2);
    assert.equal(weekdayOf('2026-03-02'), 1);
    assert.equal(addDays('2026-02-27', 3), '2026-03-02');
  });

  await check('slots: only chosen days, only after now, in order, inside the horizon', () => {
    const rule = { daysOfWeek: [1, 3], timeOfDay: '09:30', timezone: 'Asia/Dhaka' };
    // Monday 2026-03-02 at 10:00 UTC is 16:00 in Dhaka, after the Monday slot.
    const slots = slotsFor(rule, new Date('2026-03-02T10:00:00Z'), 14).map(iso);
    assert.deepEqual(slots.slice(0, 3), [
      '2026-03-04T03:30:00.000Z',
      '2026-03-09T03:30:00.000Z',
      '2026-03-11T03:30:00.000Z',
    ]);
    assert.equal(slots.length, 4);
    // Before the slot of the same day, that day counts.
    assert.equal(
      iso(slotsFor(rule, new Date('2026-03-02T01:00:00Z'), 0)[0] ?? new Date(0)),
      '2026-03-02T03:30:00.000Z',
    );
    // The local day differs from the UTC day.
    assert.equal(
      iso(
        slotsFor(
          { daysOfWeek: [2], timeOfDay: '00:30', timezone: 'Asia/Dhaka' },
          new Date('2026-03-02T17:00:00Z'),
          1,
        )[0] ?? new Date(0),
      ),
      '2026-03-02T18:30:00.000Z',
    );
    assert.equal(
      slotsFor(
        { daysOfWeek: [2], timeOfDay: '00:30', timezone: 'Asia/Dhaka' },
        new Date('2026-03-02T20:00:00Z'),
        0,
      ).length,
      0,
    );
    assert.equal(
      slotsFor({ daysOfWeek: [], timeOfDay: '09:00', timezone: 'UTC' }, new Date(), 14).length,
      0,
    );
    // All seven days for 14 days is capped by the size of one run.
    assert.equal(
      slotsFor(
        { daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: '09:00', timezone: 'UTC' },
        new Date('2026-03-02T10:00:00Z'),
        90,
      ).length,
      30,
    );
  });

  await check(
    'evergreen: priority first, then the one shared longest ago; variants turn; the plan is due on time',
    () => {
      const items = [
        {
          id: 'b',
          priority: 3,
          lastPostedAt: '2026-02-01T00:00:00Z',
          variants: ['x'],
          nextVariant: 0,
        },
        { id: 'a', priority: 3, lastPostedAt: null, variants: ['x'], nextVariant: 0 },
        {
          id: 'c',
          priority: 5,
          lastPostedAt: '2026-03-01T00:00:00Z',
          variants: ['x'],
          nextVariant: 0,
        },
        {
          id: 'd',
          priority: 3,
          lastPostedAt: '2026-01-01T00:00:00Z',
          variants: ['x'],
          nextVariant: 0,
        },
      ];
      assert.deepEqual(
        rankEvergreen(items).map((i) => i.id),
        ['c', 'a', 'd', 'b'],
      );
      assert.deepEqual(variantFor({ variants: ['one', 'two', 'three'], nextVariant: 0 }), {
        text: 'one',
        next: 1,
      });
      assert.deepEqual(variantFor({ variants: ['one', 'two', 'three'], nextVariant: 2 }), {
        text: 'three',
        next: 0,
      });
      assert.deepEqual(variantFor({ variants: ['one'], nextVariant: 7 }), { text: 'one', next: 0 });
      const plan = {
        everyDays: 3,
        timeOfDay: '10:00',
        timezone: 'UTC',
        lastRunAt: '2026-03-01T10:05:00Z',
      };
      assert.equal(evergreenDue(plan, new Date('2026-03-04T09:59:00Z')), false);
      assert.equal(evergreenDue(plan, new Date('2026-03-04T10:00:00Z')), true);
      assert.equal(
        evergreenDue({ ...plan, lastRunAt: null }, new Date('2026-03-04T09:00:00Z')),
        false,
      );
      assert.equal(
        evergreenDue({ ...plan, lastRunAt: null }, new Date('2026-03-04T11:00:00Z')),
        true,
      );
      assert.equal(queueLow(4, 5), true);
      assert.equal(queueLow(5, 5), false);
      assert.equal(queueLow(0, 0), false);
    },
  );

  await check('rule templates: four names, unknown names found, empty values tidied', () => {
    assert.deepEqual(unknownTokens('New: {title} {url} {summary} {image}'), []);
    assert.deepEqual(unknownTokens('Hi {name} {title} {name2}'), ['name', 'name2']);
    assert.equal(
      renderTemplate('New: {title}\n{summary}\n\n\n{url}', {
        title: 'Launch',
        url: 'https://x.test/a',
        summary: '',
        image: null,
      }),
      'New: Launch\n\nhttps://x.test/a',
    );
    assert.equal(
      renderTemplate('{title}  {url}', { title: 'A', url: null, summary: '', image: null }),
      'A',
    );
    assert.equal(
      renderTemplate('{unknown} {title}', { title: 'A', url: null, summary: '', image: null }),
      '{unknown} A',
    );
    assert.equal(
      ruleInput.safeParse({
        name: 'n',
        triggerKey: 'Blog Published',
        accountIds: [A],
        bodyTemplate: 'x',
      }).success,
      false,
    );
    assert.equal(
      ruleInput.safeParse({
        name: 'n',
        triggerKey: 'blog.published',
        accountIds: [],
        bodyTemplate: 'x',
      }).success,
      false,
    );
    assert.equal(
      ruleInput.safeParse({
        name: 'n',
        triggerKey: 'blog.published',
        accountIds: [A],
        bodyTemplate: 'x',
        extra: 1,
      }).success,
      false,
    );
    assert.equal(
      ruleInput.safeParse({
        name: 'n',
        triggerKey: 'blog.published',
        accountIds: [A],
        bodyTemplate: 'x',
      }).success,
      true,
    );
  });

  await check(
    'tracked links: addresses found once, replaced with the short address, trailing punctuation kept',
    () => {
      const text =
        'Read https://shop.example.test/a?x=1, and https://shop.example.test/a?x=1. Also https://b.example.test/path)';
      assert.deepEqual(urlsIn(text), [
        'https://shop.example.test/a?x=1',
        'https://b.example.test/path',
      ]);
      const map = new Map([
        ['https://shop.example.test/a?x=1', trackedUrl('https://app.test', 'AbCdEf1234')],
        ['https://b.example.test/path', trackedUrl('https://app.test', 'ZzZzZzZz12')],
      ]);
      assert.equal(
        replaceUrls(text, map),
        'Read https://app.test/api/social/l/AbCdEf1234, and https://app.test/api/social/l/AbCdEf1234. Also https://app.test/api/social/l/ZzZzZzZz12)',
      );
      assert.equal(isTracked('https://app.test/api/social/l/AbCdEf1234', 'https://app.test'), true);
      assert.equal(
        isTracked('https://other.test/api/social/l/AbCdEf1234', 'https://app.test'),
        false,
      );
      assert.equal(urlsIn('no links here, http://insecure.test is not one').length, 0);
      assert.equal(LINK_CODE.test('AbCdEf1234'), true);
      assert.equal(LINK_CODE.test('AbCdEf123'), false);
      assert.equal(LINK_CODE.test('AbCdEf12-4'), false);
      const bytes = new Uint8Array([
        0, 61, 62, 123, 255, 250, 248, 247, 100, 200, 10, 11, 12, 13, 14, 15,
      ]);
      const code = codeFromBytes(bytes);
      assert.equal(code.length, 10);
      assert.equal(LINK_CODE.test(code), true);
      assert.equal(codeFromBytes(new Uint8Array([255, 255, 250])), '');
    },
  );

  await check(
    'analytics: best hours in the time zone, period comparison, top posts, Threads numbers',
    () => {
      const buckets = [
        { hourStart: '2026-03-02T03:00:00Z', clicks: 5 },
        { hourStart: '2026-03-03T03:00:00Z', clicks: 4 },
        { hourStart: '2026-03-02T12:00:00Z', clicks: 6 },
        { hourStart: '2026-03-02T13:00:00Z', clicks: 0 },
      ];
      assert.deepEqual(bestHours(buckets, 'UTC', 5), [
        { hour: 3, clicks: 9 },
        { hour: 12, clicks: 6 },
      ]);
      assert.deepEqual(bestHours(buckets, 'Asia/Dhaka', 1), [{ hour: 9, clicks: 9 }]);
      assert.deepEqual(compare(15, 10), { current: 15, previous: 10, changePercent: '50.0' });
      assert.deepEqual(compare(7, 8), { current: 7, previous: 8, changePercent: '-12.5' });
      assert.deepEqual(compare(3, 0), { current: 3, previous: 0, changePercent: null });
      assert.deepEqual(
        topPosts(
          [
            { postId: 'b', clicks: 3, views: 10 },
            { postId: 'a', clicks: 3, views: 20 },
            { postId: 'c', clicks: 9, views: null },
          ],
          2,
        ).map((p) => p.postId),
        ['c', 'a'],
      );
      const json = {
        data: [
          { name: 'views', period: 'lifetime', values: [{ value: 200 }], title: 'Views' },
          { name: 'likes', values: [{ value: 14 }] },
          { name: 'replies', total_value: { value: 3 } },
          { name: 'bad', values: [{ value: 'x' }] },
          { name: 'neg', values: [{ value: -4 }] },
        ],
      };
      assert.deepEqual(metricsOf(json), { views: 200, likes: 14, replies: 3 });
      assert.deepEqual(metricsOf(null), {});
      assert.equal(
        engagementRate({ views: 200, likes: 14, replies: 3, reposts: 2, quotes: 1 }),
        '10.0',
      );
      assert.equal(engagementRate({ views: 3, likes: 1 }), '33.3');
      assert.equal(engagementRate({ views: 0, likes: 5 }), null);
    },
  );

  await check('daily limits: the lower of the network limit and the limit of the company', () => {
    assert.equal(effectiveLimit('instagram', null), 50);
    assert.equal(effectiveLimit('instagram', 10), 10);
    assert.equal(effectiveLimit('instagram', 80), 50);
    assert.equal(effectiveLimit('facebook', null), null);
    assert.equal(effectiveLimit('facebook', 4), 4);
    assert.equal(withinDailyLimit('facebook', 3, 4), true);
    assert.equal(withinDailyLimit('facebook', 4, 4), false);
    assert.equal(withinDailyLimit('facebook', 1000, null), true);
  });

  await check('inputs are strict: schedules, settings, evergreen, fire and decisions', () => {
    const ok = {
      accountId: A,
      name: 'Weekdays',
      body: 'Good morning',
      daysOfWeek: [1, 2, 3],
      timeOfDay: '09:30',
      timezone: 'Asia/Dhaka',
    };
    assert.equal(scheduleInput.safeParse(ok).success, true);
    assert.equal(scheduleInput.safeParse({ ...ok, daysOfWeek: [7] }).success, false);
    assert.equal(scheduleInput.safeParse({ ...ok, daysOfWeek: [1, 1] }).success, false);
    assert.equal(scheduleInput.safeParse({ ...ok, daysOfWeek: [] }).success, false);
    assert.equal(scheduleInput.safeParse({ ...ok, timeOfDay: '9:30' }).success, false);
    assert.equal(scheduleInput.safeParse({ ...ok, timezone: 'Nowhere/City' }).success, false);
    assert.equal(scheduleInput.safeParse({ ...ok, body: '' }).success, false);
    assert.equal(
      scheduleInput.safeParse({ ...ok, body: '', imageUrl: 'https://x.test/a.jpg' }).success,
      true,
    );
    assert.equal(scheduleInput.safeParse({ ...ok, linkUrl: 'http://x.test' }).success, false);
    assert.equal(scheduleInput.safeParse({ ...ok, body: '<b>x</b>' }).success, false);
    assert.equal(scheduleInput.safeParse({ ...ok, extra: true }).success, false);
    assert.equal(scheduleUpdate.safeParse({ version: 1, enabled: false }).success, true);
    assert.equal(scheduleUpdate.safeParse({ enabled: false }).success, false);
    assert.equal(
      settingsInput.safeParse({ approvalRequired: true, approvalSlaHours: 24, trackLinks: true })
        .success,
      true,
    );
    assert.equal(
      settingsInput.safeParse({ approvalRequired: true, approvalSlaHours: 0, trackLinks: true })
        .success,
      false,
    );
    assert.equal(
      settingsInput.safeParse({ approvalRequired: true, approvalSlaHours: 200, trackLinks: true })
        .success,
      false,
    );
    assert.equal(
      evergreenItemInput.safeParse({ accountId: A, name: 'Tip', variants: ['a', 'b'] }).success,
      true,
    );
    assert.equal(
      evergreenItemInput.safeParse({ accountId: A, name: 'Tip', variants: [] }).success,
      false,
    );
    assert.equal(
      evergreenItemInput.safeParse({
        accountId: A,
        name: 'Tip',
        variants: ['1', '2', '3', '4', '5', '6', '7'],
      }).success,
      false,
    );
    assert.equal(
      evergreenItemInput.safeParse({ accountId: A, name: 'Tip', variants: ['a'], priority: 6 })
        .success,
      false,
    );
    assert.equal(
      evergreenPlanInput.safeParse({
        accountId: A,
        everyDays: 3,
        timeOfDay: '10:00',
        timezone: 'UTC',
      }).success,
      true,
    );
    assert.equal(
      evergreenPlanInput.safeParse({
        accountId: A,
        everyDays: 0,
        timeOfDay: '10:00',
        timezone: 'UTC',
      }).success,
      false,
    );
    assert.equal(
      fireInput.safeParse({ triggerKey: 'blog.published', sourceKey: 'post-1', title: 'T' })
        .success,
      true,
    );
    assert.equal(
      fireInput.safeParse({ triggerKey: 'blog.published', sourceKey: '', title: 'T' }).success,
      false,
    );
    assert.equal(
      fireInput.safeParse({ triggerKey: 'blog.published', sourceKey: 'p', url: 'http://x.test' })
        .success,
      false,
    );
    assert.equal(decisionInput.safeParse({ decision: 'approve' }).success, true);
    assert.equal(decisionInput.safeParse({ decision: 'reject' }).success, false);
    assert.equal(decisionInput.safeParse({ decision: 'reject', reason: 'Not now' }).success, true);
  });

  await check(
    'Threads insights: GET with the token in a header and the six metrics, numbers read from the answer',
    async () => {
      let seen: { url: string; headers: Record<string, string>; method: string } | null = null;
      const metrics = await threadsAdapter.insights?.(
        { provider: 'threads', externalId: '1234567', token: 'THREADS-TOKEN-0123456789' },
        '18000000000000001',
        async (url, init) => {
          seen = {
            url,
            headers: (init.headers ?? {}) as Record<string, string>,
            method: String(init.method),
          };
          return new Response(
            JSON.stringify({
              data: [
                { name: 'views', values: [{ value: 40 }] },
                { name: 'likes', values: [{ value: 5 }] },
              ],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        },
      );
      assert.deepEqual(metrics, { views: 40, likes: 5 });
      const call = seen as { url: string; headers: Record<string, string>; method: string } | null;
      assert.equal(call?.method, 'GET');
      assert.equal(
        call?.url,
        'https://graph.threads.com/v1.0/18000000000000001/insights?metric=views%2Clikes%2Creplies%2Creposts%2Cquotes%2Cshares',
      );
      assert.equal(call?.headers.authorization, 'Bearer THREADS-TOKEN-0123456789');
      assert.equal(call?.url.includes('THREADS-TOKEN'), false);
    },
  );

  process.stdout.write(`step16-social-schedule: ${checks} checks passed\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
