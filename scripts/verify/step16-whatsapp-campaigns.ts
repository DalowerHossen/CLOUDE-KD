// path: scripts/verify/step16-whatsapp-campaigns.ts
// Logic checks of WhatsApp rules and campaigns (16.3.b) that need no database or network: the tokens that fill a template from
// an invoice, payment or client, the rule inputs (the trigger fields and the allowed tokens), the segment, the audience (who is
// left out and why, one person once), the daily limit, which failures are worth retrying, the delivery share, the delay and
// due-date arithmetic, and the reading of Meta's messaging limit text. The tables, the status guard of a campaign, the
// one-run-per-source rule and the daily count of people are tested in sql/assertions/s16_004_whatsapp_automation.sql. Sending,
// the cron batches, the event handler and the pages need a running app.
// Run: SKIP_ENV_VALIDATION=1 npx tsx --conditions=react-server scripts/verify/step16-whatsapp-campaigns.ts
import assert from 'node:assert/strict';
import { CAMPAIGN_MAX_AUDIENCE, RULE_EVENTS } from '@/config/s16-whatsapp';
import {
  allowedTokens,
  buildAudience,
  campaignFinished,
  campaignInput,
  deliveryShare,
  dueDateFor,
  fillValues,
  inSegment,
  isPermanentFailure,
  parseMessagingLimit,
  remainingToday,
  ruleInput,
  ruleUpdate,
  runDueAt,
  segmentInput,
  tokenProblem,
  tokensIn,
  type AudienceClient,
  type ClientStats,
} from '@/lib/whatsapp/automation-rules';
import { toE164 } from '@/lib/whatsapp/rules';
import { refsOf } from '@/services/whatsapp/recipients';

let checks = 0;
const check = (name: string, fn: () => void): void => {
  try {
    fn();
    checks += 1;
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    throw error;
  }
};

const T = '11111111-1111-4111-8111-111111111111';
const stats = (balance: string, open: number, last: string | null): ClientStats => ({
  balance,
  openInvoices: open,
  lastInvoiceDate: last,
});
const client = (
  id: string,
  phone: string,
  tags: string[] = [],
  doNotContact = false,
): AudienceClient => ({ id, name: `Client ${id}`, contactName: '', phone, tags, doNotContact });
const seg = (extra: object = {}): ReturnType<typeof segmentInput.parse> =>
  segmentInput.parse(extra);

check('tokens: found, allowed per trigger, and unknown ones are named', () => {
  assert.deepEqual(tokensIn('Hi {client.name}, invoice {invoice.number} is {invoice.total}'), [
    'client.name',
    'invoice.number',
    'invoice.total',
  ]);
  assert.deepEqual(tokensIn('no tokens {{1}} here'), []);
  assert.ok(allowedTokens({ kind: 'event', event: 'client.created' }).includes('client.name'));
  assert.ok(!allowedTokens({ kind: 'event', event: 'client.created' }).includes('invoice.number'));
  assert.ok(allowedTokens({ kind: 'event', event: 'invoice.paid' }).includes('invoice.total'));
  assert.ok(!allowedTokens({ kind: 'event', event: 'invoice.paid' }).includes('payment.amount'));
  assert.ok(allowedTokens({ kind: 'event', event: 'payment.captured' }).includes('payment.amount'));
  assert.ok(allowedTokens({ kind: 'due_soon' }).includes('invoice.due_date'));
  assert.equal(tokenProblem({ '1': 'Hi {client.name}' }, ['client.name']), null);
  assert.match(tokenProblem({ '1': '{payment.amount}' }, ['client.name']) ?? '', /payment\.amount/);
});

check('fillValues: tokens are replaced, empty results are reported', () => {
  const r = fillValues(
    {
      '1': 'Dear {client.name}',
      '2': '{invoice.number}',
      '3': '{client.name} owes {invoice.amount_due}',
    },
    { 'client.name': 'Ann', 'invoice.amount_due': '120.0000' },
  );
  assert.deepEqual(r.values, { '1': 'Dear Ann', '2': '', '3': 'Ann owes 120.0000' });
  assert.deepEqual(r.empty, ['2']);
});

check(
  'rule input: an event rule needs an event, a due-date rule needs days, tokens must fit the trigger',
  () => {
    const base = { name: 'Thanks', templateId: T, values: { '1': '{client.name}' } };
    const ok = ruleInput.safeParse({
      ...base,
      triggerKind: 'event',
      eventName: 'payment.captured',
    });
    assert.ok(ok.success);
    assert.equal(ok.success && ok.data.dryRun, true);
    assert.equal(ok.success && ok.data.enabled, false);
    assert.ok(!ruleInput.safeParse({ ...base, triggerKind: 'event' }).success);
    assert.ok(
      !ruleInput.safeParse({
        ...base,
        triggerKind: 'event',
        eventName: 'payment.captured',
        daysBefore: 3,
      }).success,
    );
    assert.ok(
      !ruleInput.safeParse({ ...base, triggerKind: 'event', eventName: 'kyc.approved' }).success,
    );
    assert.ok(ruleInput.safeParse({ ...base, triggerKind: 'due_soon', daysBefore: 3 }).success);
    assert.ok(!ruleInput.safeParse({ ...base, triggerKind: 'due_soon' }).success);
    assert.ok(!ruleInput.safeParse({ ...base, triggerKind: 'due_soon', daysBefore: 61 }).success);
    assert.ok(
      !ruleInput.safeParse({
        ...base,
        triggerKind: 'due_soon',
        daysBefore: 3,
        eventName: 'invoice.paid',
      }).success,
    );
    assert.ok(
      !ruleInput.safeParse({
        ...base,
        triggerKind: 'event',
        eventName: 'client.created',
        values: { '1': '{invoice.number}' },
      }).success,
    );
    assert.ok(
      !ruleInput.safeParse({
        ...base,
        triggerKind: 'event',
        eventName: 'invoice.paid',
        delayMinutes: 10081,
      }).success,
    );
    assert.ok(
      !ruleInput.safeParse({
        ...base,
        triggerKind: 'event',
        eventName: 'invoice.paid',
        secret: 'x',
      }).success,
    );
    assert.ok(!ruleUpdate.safeParse({ enabled: true }).success);
    assert.ok(ruleUpdate.safeParse({ version: 2, enabled: true }).success);
    assert.ok(!ruleUpdate.safeParse({ version: 2, triggerKind: 'event' }).success);
  },
);

check('rule events are a small list of invoice, payment and client events', () => {
  assert.ok(RULE_EVENTS.includes('invoice.overdue'));
  for (const e of RULE_EVENTS) assert.ok(/^(invoice|payment|client)\./.test(e), e);
});

check('segment: tags, balance range, last invoice, open invoices', () => {
  const c = client('a', '+16505551234', ['vip', 'eu']);
  assert.ok(inSegment(c, stats('0', 0, null), seg()));
  assert.ok(inSegment(c, stats('0', 0, null), seg({ tags: ['vip'] })));
  assert.ok(!inSegment(c, stats('0', 0, null), seg({ tags: ['asia'] })));
  assert.ok(inSegment(c, stats('150.5', 2, '2026-01-01'), seg({ minBalance: '100' })));
  assert.ok(!inSegment(c, stats('99.9999', 2, '2026-01-01'), seg({ minBalance: '100' })));
  assert.ok(!inSegment(c, stats('500', 2, '2026-01-01'), seg({ maxBalance: '400' })));
  assert.ok(inSegment(c, stats('0', 0, '2026-01-01'), seg({ lastInvoiceBefore: '2026-02-01' })));
  assert.ok(!inSegment(c, stats('0', 0, '2026-03-01'), seg({ lastInvoiceBefore: '2026-02-01' })));
  assert.ok(inSegment(c, stats('0', 0, null), seg({ lastInvoiceBefore: '2026-02-01' })));
  assert.ok(inSegment(c, stats('10', 1, null), seg({ hasOpenInvoices: true })));
  assert.ok(!inSegment(c, stats('0', 0, null), seg({ hasOpenInvoices: true })));
  assert.ok(inSegment(c, stats('0', 0, null), seg({ hasOpenInvoices: false })));
  assert.ok(!segmentInput.safeParse({ minBalance: '500', maxBalance: '100' }).success);
  assert.ok(!segmentInput.safeParse({ unknown: 1 }).success);
});

check('audience: one person once; clients left out are kept with the reason', () => {
  const rows = [
    { ...client('1', '+1 650 555 1234'), stats: stats('0', 0, null) },
    { ...client('2', '16505551234'), stats: stats('0', 0, null) },
    { ...client('3', 'not a number'), stats: stats('0', 0, null) },
    { ...client('4', '+16505551235', [], true), stats: stats('0', 0, null) },
    { ...client('5', '+16505551236'), stats: stats('0', 0, null) },
    { ...client('6', '+16505551237'), stats: stats('0', 0, null) },
    { ...client('7', '+16505551238'), stats: stats('0', 0, null) },
  ];
  const optOf = (p: string): 'opted_in' | 'opted_out' | 'unknown' =>
    p === '+16505551234' || p === '+16505551235'
      ? 'opted_in'
      : p === '+16505551236'
        ? 'opted_out'
        : 'unknown';
  const a = buildAudience(rows, seg(), toE164, optOf);
  assert.deepEqual(
    a.map((x) => [x.clientId, x.status]),
    [
      ['1', 'pending'],
      ['4', 'skipped'],
      ['5', 'skipped'],
      ['6', 'skipped'],
      ['7', 'skipped'],
    ].filter((x) => x[0] !== '3'),
  );
  assert.equal(a.find((x) => x.clientId === '4')?.reason, 'The client asked not to be contacted.');
  assert.equal(a.find((x) => x.clientId === '5')?.reason, 'The person opted out of messages.');
  assert.equal(a.find((x) => x.clientId === '6')?.reason, 'The person has not opted in.');
  const open = buildAudience(rows, seg({ optedInOnly: false }), toE164, optOf);
  assert.equal(open.find((x) => x.clientId === '6')?.status, 'pending');
  assert.equal(open.find((x) => x.clientId === '5')?.status, 'skipped');
  assert.equal(open.filter((x) => x.phone === '+16505551234').length, 1);
});

check('audience: a segment limits it and the size has a cap', () => {
  const many = Array.from({ length: CAMPAIGN_MAX_AUDIENCE + 50 }, (_, i) => ({
    ...client(String(i), `+1650${String(5000000 + i).padStart(7, '0')}`),
    stats: stats('0', 0, null),
  }));
  assert.equal(
    buildAudience(many, seg({ optedInOnly: false }), toE164, () => 'unknown').length,
    CAMPAIGN_MAX_AUDIENCE,
  );
  const vip = [
    { ...client('1', '+16505551234', ['vip']), stats: stats('0', 0, null) },
    { ...client('2', '+16505551235'), stats: stats('0', 0, null) },
  ];
  assert.equal(
    buildAudience(vip, seg({ tags: ['vip'], optedInOnly: false }), toE164, () => 'unknown').length,
    1,
  );
});

check('the daily limit: what is left of the people you may start a conversation with today', () => {
  assert.equal(remainingToday(250, 0), 250);
  assert.equal(remainingToday(250, 249), 1);
  assert.equal(remainingToday(250, 250), 0);
  assert.equal(remainingToday(250, 400), 0);
});

check('retry: a number that is not on WhatsApp is never retried, other failures are', () => {
  assert.ok(isPermanentFailure(131026));
  assert.ok(isPermanentFailure(131021));
  assert.ok(!isPermanentFailure(131056));
  assert.ok(!isPermanentFailure(131000));
  assert.ok(!isPermanentFailure(null));
});

check('delivery share has one decimal and handles zero', () => {
  assert.equal(deliveryShare(0, 0), '0');
  assert.equal(deliveryShare(1, 3), '33.3');
  assert.equal(deliveryShare(2, 3), '66.7');
  assert.equal(deliveryShare(5, 5), '100.0');
});

check('a campaign is finished when nothing waits', () => {
  assert.ok(campaignFinished({ pending: 0, sent: 3, failed: 1, skipped: 2, dryRun: 0 }));
  assert.ok(!campaignFinished({ pending: 1, sent: 3, failed: 1, skipped: 2, dryRun: 0 }));
});

check('delays and due dates', () => {
  assert.equal(runDueAt('2026-06-10T10:00:00.000Z', 0), '2026-06-10T10:00:00.000Z');
  assert.equal(runDueAt('2026-06-10T10:00:00.000Z', 90), '2026-06-10T11:30:00.000Z');
  assert.equal(dueDateFor('2026-01-30', 3), '2026-02-02');
  assert.equal(dueDateFor('2028-02-27', 2), '2028-02-29');
  assert.equal(dueDateFor('2026-12-30', 3), '2027-01-02');
  assert.equal(dueDateFor('2026-06-10', 0), '2026-06-10');
});

check(
  'Meta messaging limit text: the documented TIER_250 is read, odd text leaves the limit alone',
  () => {
    assert.equal(parseMessagingLimit('TIER_250'), 250);
    assert.equal(parseMessagingLimit('tier_250'), 250);
    assert.equal(parseMessagingLimit('TIER_2K'), 2000);
    assert.equal(parseMessagingLimit('TIER_UNLIMITED'), 1_000_000);
    assert.equal(parseMessagingLimit('SOMETHING'), null);
    assert.equal(parseMessagingLimit(''), null);
  },
);

check('campaign input: client tokens only, a strict segment, a dry run by default', () => {
  const ok = campaignInput.safeParse({
    name: 'June',
    templateId: T,
    values: { '1': '{client.name}' },
  });
  assert.ok(ok.success);
  assert.equal(ok.success && ok.data.dryRun, true);
  assert.equal(ok.success && ok.data.segment.optedInOnly, true);
  assert.ok(
    !campaignInput.safeParse({ name: 'June', templateId: T, values: { '1': '{invoice.total}' } })
      .success,
  );
  assert.ok(!campaignInput.safeParse({ name: '', templateId: T }).success);
  assert.ok(!campaignInput.safeParse({ name: 'June', templateId: T, status: 'running' }).success);
  assert.ok(!campaignInput.safeParse({ name: 'June', templateId: 'x' }).success);
});

check('event payloads: only real ids are used to find the client', () => {
  assert.deepEqual(refsOf({ clientId: T, invoiceId: 'drop table', paymentId: 5 }), {
    clientId: T,
    invoiceId: undefined,
    paymentId: undefined,
  });
  assert.deepEqual(refsOf({}), { clientId: undefined, invoiceId: undefined, paymentId: undefined });
});

process.stdout.write(`step16-whatsapp-campaigns: ${checks} checks passed\n`);
