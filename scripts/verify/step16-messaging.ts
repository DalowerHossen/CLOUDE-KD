// path: scripts/verify/step16-messaging.ts
// Logic checks of multi-channel messaging (16.9) that need no database or network: the order in which channels are tried for a
// client (route, preferred, blocked), the chain that passes over a channel without consent or address and uses the next allowed
// one, quiet hours across midnight in a time zone, the split of an audience for an A/B test, the winner rule (minimum sample, tie,
// small sample at the end, nothing delivered), rates, the monthly cost and the channel report with exact money, and the strict
// inputs. The services, the e-mail and WhatsApp sending, the cron job and the page need a running app and are not covered here;
// tables, guards and the claim are tested in sql/assertions/s16_010_messaging.sql.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step16-messaging.ts
import assert from 'node:assert/strict';
import {
  audienceInput,
  campaignInput,
  channelReport,
  hash32,
  inQuiet,
  messageInput,
  monthlyCost,
  pickWinner,
  prefsInput,
  quietEnds,
  rate,
  renderClientText,
  resolveChain,
  routeInput,
  runChain,
  settingsInput,
  splitAudience,
  type AttemptLike,
} from '@/lib/messaging/rules';

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
const ids = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);

async function main(): Promise<void> {
  await check('order of channels: route, preferred first, blocked removed', () => {
    assert.deepEqual(resolveChain(['email', 'whatsapp'], { preferred: null, blocked: [] }), [
      'email',
      'whatsapp',
    ]);
    assert.deepEqual(resolveChain(['email', 'whatsapp'], { preferred: 'whatsapp', blocked: [] }), [
      'whatsapp',
      'email',
    ]);
    assert.deepEqual(resolveChain(['email', 'whatsapp'], { preferred: null, blocked: ['email'] }), [
      'whatsapp',
    ]);
    assert.deepEqual(resolveChain(['email'], { preferred: 'whatsapp', blocked: [] }), ['email']);
    assert.deepEqual(
      resolveChain(['email', 'whatsapp'], { preferred: null, blocked: ['email', 'whatsapp'] }),
      [],
    );
    assert.deepEqual(resolveChain(['whatsapp', 'email'], { preferred: 'email', blocked: [] }), [
      'email',
      'whatsapp',
    ]);
  });

  await check(
    'a recipient without consent on a channel is skipped and the next allowed channel is used',
    async () => {
      const order: string[] = [];
      const run = (
        answers: Record<string, AttemptLike['result']>,
      ): ReturnType<typeof runChain<AttemptLike>> =>
        runChain(['email', 'whatsapp'], async (channel) => {
          order.push(channel);
          return { channel, result: answers[channel] ?? 'skipped' };
        });
      const noEmailConsent = await run({ email: 'skipped', whatsapp: 'sent' });
      assert.equal(noEmailConsent.outcome, 'sent');
      assert.equal(noEmailConsent.sent?.channel, 'whatsapp');
      assert.deepEqual(
        noEmailConsent.attempts.map((a) => a.result),
        ['skipped', 'sent'],
      );
      order.length = 0;
      const first = await run({ email: 'sent', whatsapp: 'sent' });
      assert.equal(first.sent?.channel, 'email');
      assert.deepEqual(order, ['email'], 'the next channel is not tried after a send');
      assert.equal((await run({ email: 'failed', whatsapp: 'sent' })).sent?.channel, 'whatsapp');
      assert.equal((await run({ email: 'skipped', whatsapp: 'skipped' })).outcome, 'skipped');
      assert.equal((await run({ email: 'skipped', whatsapp: 'failed' })).outcome, 'failed');
      assert.equal(
        (await runChain([], async () => ({ channel: 'email' as const, result: 'sent' as const })))
          .outcome,
        'skipped',
      );
    },
  );

  await check('quiet hours across midnight in a time zone, and when they end', () => {
    const q = { enabled: true, start: '22:00', end: '08:00', timezone: 'Asia/Dhaka' };
    // Dhaka is UTC+6: 23:30 UTC is 05:30 next day (quiet); 03:00 UTC is 09:00 (open); 16:30 UTC is 22:30 (quiet).
    assert.equal(inQuiet(new Date('2026-03-02T23:30:00Z'), q), true);
    assert.equal(inQuiet(new Date('2026-03-03T03:00:00Z'), q), false);
    assert.equal(inQuiet(new Date('2026-03-02T16:30:00Z'), q), true);
    assert.equal(inQuiet(new Date('2026-03-02T16:00:00Z'), q), true);
    assert.equal(inQuiet(new Date('2026-03-02T01:59:00Z'), q), true);
    assert.equal(inQuiet(new Date('2026-03-02T02:00:00Z'), q), false);
    assert.equal(inQuiet(new Date('2026-03-02T23:30:00Z'), { ...q, enabled: false }), false);
    // At 22:30 Dhaka the hours end at 08:00 the next morning (02:00 UTC).
    assert.equal(
      quietEnds(new Date('2026-03-02T16:30:00Z'), q).toISOString(),
      '2026-03-03T02:00:00.000Z',
    );
    // At 05:30 Dhaka they end the same morning.
    assert.equal(
      quietEnds(new Date('2026-03-02T23:30:00Z'), q).toISOString(),
      '2026-03-03T02:00:00.000Z',
    );
    const day = { enabled: true, start: '12:00', end: '14:00', timezone: 'UTC' };
    assert.equal(inQuiet(new Date('2026-03-02T13:00:00Z'), day), true);
    assert.equal(inQuiet(new Date('2026-03-02T14:00:00Z'), day), false);
    assert.equal(
      quietEnds(new Date('2026-03-02T13:00:00Z'), day).toISOString(),
      '2026-03-02T14:00:00.000Z',
    );
  });

  await check('A/B split: stable, the right size, every variant gets a share, nobody twice', () => {
    const all = ids(100);
    const s1 = splitAudience(all, ['A', 'B'], 20, 'camp-1');
    const s2 = splitAudience([...all].reverse(), ['A', 'B'], 20, 'camp-1');
    assert.equal(s1.test.size, 20);
    assert.equal(s1.holdout.length, 80);
    assert.deepEqual([...s1.test.entries()].sort(), [...s2.test.entries()].sort());
    const counts = { A: 0, B: 0 };
    for (const v of s1.test.values()) counts[v as 'A' | 'B'] += 1;
    assert.deepEqual(counts, { A: 10, B: 10 });
    assert.equal(new Set([...s1.test.keys(), ...s1.holdout]).size, 100);
    const small = splitAudience(ids(5), ['A', 'B', 'C'], 5, 'x');
    assert.equal(small.test.size, 3, 'at least one client for each variant');
    assert.equal(splitAudience(ids(1), ['A', 'B'], 50, 'x').test.size, 1);
    assert.notDeepEqual(
      [...splitAudience(all, ['A', 'B'], 20, 'camp-2').test.keys()].sort(),
      [...s1.test.keys()].sort(),
    );
    assert.equal(hash32('abc'), hash32('abc'));
    assert.notEqual(hash32('abc'), hash32('abd'));
  });

  await check(
    'winner rule: highest share among variants with enough delivered; ties to the earlier label',
    () => {
      const v = (
        label: string,
        delivered: number,
        engaged: number,
      ): { label: string; variantId: string; delivered: number; engaged: number } => ({
        label,
        variantId: `id-${label}`,
        delivered,
        engaged,
      });
      assert.equal(pickWinner([v('A', 100, 20), v('B', 100, 30)], 20, false)?.label, 'B');
      assert.equal(pickWinner([v('A', 100, 30), v('B', 100, 30)], 20, false)?.label, 'A');
      assert.equal(
        pickWinner([v('A', 50, 10), v('B', 200, 41)], 20, false)?.label,
        'B',
        'compared by share, not by count',
      );
      assert.equal(
        pickWinner([v('A', 10, 9), v('B', 100, 30)], 20, false),
        null,
        'one variant is below the sample: wait',
      );
      assert.equal(pickWinner([v('A', 10, 9), v('B', 5, 1)], 20, false), null);
      assert.equal(
        pickWinner([v('A', 10, 9), v('B', 100, 30)], 20, true)?.label,
        'A',
        'at the end the best share wins, with a note',
      );
      assert.match(
        pickWinner([v('A', 10, 9), v('B', 100, 30)], 20, true)?.reason ?? '',
        /small sample/,
      );
      assert.equal(pickWinner([v('A', 0, 0), v('B', 0, 0)], 20, true), null, 'nothing delivered');
      assert.match(
        pickWinner([v('A', 100, 20), v('B', 100, 30)], 20, false)?.reason ?? '',
        /30\.0% of 100/,
      );
      assert.equal(
        pickWinner([v('A', 40, 0), v('B', 40, 0)], 20, false)?.label,
        'A',
        'no engagement at all: the earlier label',
      );
    },
  );

  await check('rates, channel report and monthly cost use whole numbers and exact money', () => {
    assert.equal(rate(1, 3), '33.3');
    assert.equal(rate(30, 100), '30.0');
    assert.equal(rate(0, 5), '0.0');
    assert.equal(rate(1, 0), null);
    const rep = channelReport([
      { channel: 'email', delivered: true, engaged: true },
      { channel: 'email', delivered: true, engaged: false },
      { channel: 'email', delivered: false, engaged: false },
      { channel: 'whatsapp', delivered: true, engaged: true },
      { channel: null, delivered: false, engaged: false },
    ]);
    assert.deepEqual(
      rep.map((r) => [r.channel, r.sent, r.delivered, r.engaged, r.deliveredRate, r.engagedRate]),
      [
        ['email', 3, 2, 1, '66.6', '50.0'],
        ['whatsapp', 1, 1, 1, '100.0', '100.0'],
      ],
    );
    assert.deepEqual(
      monthlyCost([
        { month: '2026-02', channel: 'email', cost: '0.0010' },
        { month: '2026-02', channel: 'email', cost: '0.0020' },
        { month: '2026-02', channel: 'whatsapp', cost: '0.0500' },
        { month: '2026-03', channel: 'whatsapp', cost: '0.0500' },
        { month: '2026-03', channel: 'whatsapp', cost: '0.0500' },
        { month: '2026-03', channel: 'whatsapp', cost: '0.0100' },
      ]),
      [
        { month: '2026-03', email: '0.0000', whatsapp: '0.1100', total: '0.1100' },
        { month: '2026-02', email: '0.0030', whatsapp: '0.0500', total: '0.0530' },
      ],
    );
  });

  await check('client names are filled into the text, and nothing else in braces changes', () => {
    assert.equal(
      renderClientText('Hello {client.name}, {client.contact_name}! {other}', {
        name: 'Acme',
        contactName: 'Sam',
      }),
      'Hello Acme, Sam! {other}',
    );
    assert.equal(
      renderClientText('Hi {client.contact_name}', { name: 'Acme', contactName: '' }),
      'Hi Acme',
    );
  });

  await check(
    'inputs are strict: settings, routes, preferences, messages, audience, campaigns',
    () => {
      const settings = {
        quietEnabled: true,
        quietStart: '22:00',
        quietEnd: '08:00',
        timezone: 'Asia/Dhaka',
        emailCost: '0.0010',
        whatsappCost: '0.0500',
        abMinSample: 20,
      };
      assert.ok(settingsInput.safeParse(settings).success);
      assert.ok(!settingsInput.safeParse({ ...settings, quietEnd: '22:00' }).success);
      assert.ok(!settingsInput.safeParse({ ...settings, timezone: 'Nowhere/City' }).success);
      assert.ok(!settingsInput.safeParse({ ...settings, emailCost: '-1' }).success);
      assert.ok(!settingsInput.safeParse({ ...settings, emailCost: '0,5' }).success);
      assert.ok(
        routeInput.safeParse({ kind: 'invoice.overdue', channels: ['whatsapp', 'email'] }).success,
      );
      assert.ok(!routeInput.safeParse({ kind: 'invoice.overdue', channels: ['sms'] }).success);
      assert.ok(
        !routeInput.safeParse({ kind: 'invoice.overdue', channels: ['email', 'email'] }).success,
      );
      assert.ok(!routeInput.safeParse({ kind: 'Invoice Overdue', channels: ['email'] }).success);
      assert.ok(prefsInput.safeParse({ preferred: 'email', blocked: ['whatsapp'] }).success);
      assert.ok(!prefsInput.safeParse({ preferred: 'email', blocked: ['email'] }).success);
      assert.ok(messageInput.safeParse({ clientId: A, body: 'Hello' }).success);
      assert.ok(!messageInput.safeParse({ clientId: A }).success);
      assert.ok(!messageInput.safeParse({ clientId: A, body: '<script>' }).success);
      assert.ok(!audienceInput.safeParse({ minBalance: '10', maxBalance: '5' }).success);
      const email = { channelOrder: ['email'], subject: 'Hi', body: 'Hello' };
      const wa = { channelOrder: ['whatsapp'], whatsappTemplateId: A };
      assert.ok(campaignInput.safeParse({ name: 'Spring', variants: [email] }).success);
      assert.ok(
        campaignInput.safeParse({ name: 'Spring', variants: [email, wa], abEnabled: true }).success,
      );
      assert.ok(
        !campaignInput.safeParse({ name: 'Spring', variants: [email, wa] }).success,
        'two variants need the A/B test',
      );
      assert.ok(
        !campaignInput.safeParse({ name: 'Spring', variants: [email], abEnabled: true }).success,
        'a test needs two variants',
      );
      assert.ok(
        !campaignInput.safeParse({ name: 'Spring', variants: [{ channelOrder: ['whatsapp'] }] })
          .success,
        'WhatsApp needs a template',
      );
      assert.ok(
        !campaignInput.safeParse({
          name: 'Spring',
          variants: [{ channelOrder: ['email'], subject: 'Hi' }],
        }).success,
        'e-mail needs a text',
      );
      assert.ok(
        !campaignInput.safeParse({ name: 'Spring', variants: [email], testPercent: 60 }).success,
      );
      assert.ok(
        !campaignInput.safeParse({
          name: 'Spring',
          variants: [{ ...email, channelOrder: ['sms'] }],
        }).success,
      );
    },
  );

  process.stdout.write(`step16-messaging: ${checks} checks passed\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
