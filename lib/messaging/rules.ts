// path: lib/messaging/rules.ts
// Multi-channel messaging as pure functions: the inputs, the order in which channels are tried for one client, quiet hours with a
// time zone, filling client names into text, the split of an audience for an A/B test, the winner rule, rates, and the monthly cost.
// No database or network here.
import { z } from 'zod';
import { MESSAGING_CHANNELS, type MessagingChannel } from '@/config/s16-messaging';
import { floorDiv, toInt } from '@/lib/reports/numbers';
import { addDays, isTimeZone, localDay, zonedToUtc } from '@/lib/social/schedule';
import { Money } from '@/lib/utils/currency';

const plain = (min: number, max: number): z.ZodString =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });
const uuid = z.string().uuid();
const channel = z.enum(MESSAGING_CHANNELS);
const channelList = z
  .array(channel)
  .min(1)
  .max(MESSAGING_CHANNELS.length)
  .refine((v) => new Set(v).size === v.length, { message: 'A channel is listed twice.' });
const time = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'Use a time like 22:00.');
const cost = z.string().regex(/^\d{1,10}(\.\d{1,4})?$/, 'Enter a cost like 0.0500.');
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/* ---------- inputs ---------- */

export const settingsInput = z
  .object({
    quietEnabled: z.boolean(),
    quietStart: time,
    quietEnd: time,
    timezone: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .refine(isTimeZone, { message: 'Use a time zone name such as Asia/Dhaka or UTC.' }),
    emailCost: cost,
    whatsappCost: cost,
    abMinSample: z.number().int().min(1).max(10000),
  })
  .strict()
  .refine((v) => v.quietStart !== v.quietEnd, {
    message: 'Quiet hours need a start and an end that differ.',
    path: ['quietEnd'],
  });

export const routeInput = z
  .object({
    kind: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_.-]{1,40}$/, 'Use lower case letters, digits, . _ -'),
    channels: channelList,
    enabled: z.boolean().default(true),
  })
  .strict();

export const prefsInput = z
  .object({
    preferred: channel.nullable().default(null),
    blocked: z
      .array(channel)
      .max(MESSAGING_CHANNELS.length)
      .default([])
      .refine((v) => new Set(v).size === v.length, { message: 'A channel is listed twice.' }),
  })
  .strict()
  .refine((v) => v.preferred === null || !v.blocked.includes(v.preferred), {
    message: 'The preferred channel cannot be blocked.',
    path: ['preferred'],
  });

export const messageInput = z
  .object({
    clientId: uuid,
    routeKind: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_.-]{1,40}$/)
      .default('custom'),
    subject: plain(0, 200).default(''),
    body: plain(0, 4000).default(''),
    whatsappTemplateId: uuid.nullable().default(null),
    whatsappValues: z.record(z.string().max(60), plain(0, 200)).default({}),
  })
  .strict()
  .refine((v) => v.body !== '' || v.whatsappTemplateId !== null, {
    message: 'Write the text or choose a WhatsApp template.',
    path: ['body'],
  });

export const audienceInput = z
  .object({
    tags: z.array(plain(1, 40)).max(20).default([]),
    minBalance: cost.nullable().default(null),
    maxBalance: cost.nullable().default(null),
    lastInvoiceBefore: day.nullable().default(null),
    hasOpenInvoices: z.boolean().nullable().default(null),
  })
  .strict()
  .refine(
    (v) =>
      v.minBalance === null || v.maxBalance === null || Money.parse(v.minBalance).lte(v.maxBalance),
    { message: 'The lowest balance cannot be above the highest.', path: ['minBalance'] },
  );
export type Audience = z.infer<typeof audienceInput>;

export const variantInput = z
  .object({
    channelOrder: channelList,
    subject: plain(0, 200).default(''),
    body: plain(0, 4000).default(''),
    whatsappTemplateId: uuid.nullable().default(null),
    whatsappValues: z.record(z.string().max(60), plain(0, 200)).default({}),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.channelOrder.includes('whatsapp') && v.whatsappTemplateId === null)
      ctx.addIssue({
        code: 'custom',
        path: ['whatsappTemplateId'],
        message: 'Choose a WhatsApp template.',
      });
    if (v.channelOrder.includes('email') && (v.subject === '' || v.body === ''))
      ctx.addIssue({
        code: 'custom',
        path: ['subject'],
        message: 'An e-mail needs a subject and a text.',
      });
  });

export const campaignInput = z
  .object({
    name: plain(1, 100),
    audience: audienceInput.prefault({}),
    variants: z.array(variantInput).min(1).max(4),
    abEnabled: z.boolean().default(false),
    testPercent: z.number().int().min(5).max(50).default(20),
    decideAfterHours: z.number().int().min(1).max(168).default(24),
  })
  .strict()
  .refine((v) => !v.abEnabled || v.variants.length >= 2, {
    message: 'An A/B test needs at least two variants.',
    path: ['variants'],
  })
  .refine((v) => v.abEnabled || v.variants.length === 1, {
    message: 'More than one variant is only for an A/B test.',
    path: ['variants'],
  });

/* ---------- which channels, in which order ---------- */

/** The channels to try for one client: the route's order, the preferred channel first, blocked channels removed. */
export function resolveChain(
  route: readonly MessagingChannel[],
  prefs: { preferred: MessagingChannel | null; blocked: readonly MessagingChannel[] },
): MessagingChannel[] {
  const open = route.filter((c) => !prefs.blocked.includes(c));
  if (prefs.preferred !== null && open.includes(prefs.preferred))
    return [prefs.preferred, ...open.filter((c) => c !== prefs.preferred)];
  return [...open];
}

/* ---------- the chain ---------- */

export interface AttemptLike {
  channel: MessagingChannel;
  result: 'sent' | 'skipped' | 'failed';
}

/**
 * Tries the channels in order and stops at the first that sends. A channel that is skipped (no address, no consent, a rule of the
 * channel) or fails is passed over. The outcome is "sent" when one channel sent, "failed" when none sent and at least one failed,
 * and "skipped" when none sent and every channel refused.
 */
export async function runChain<A extends AttemptLike>(
  chain: readonly MessagingChannel[],
  attempt: (channel: MessagingChannel) => Promise<A>,
): Promise<{ attempts: A[]; sent: A | null; outcome: 'sent' | 'failed' | 'skipped' }> {
  const attempts: A[] = [];
  for (const channel of chain) {
    const a = await attempt(channel);
    attempts.push(a);
    if (a.result === 'sent') return { attempts, sent: a, outcome: 'sent' };
  }
  return {
    attempts,
    sent: null,
    outcome: attempts.some((a) => a.result === 'failed') ? 'failed' : 'skipped',
  };
}

/* ---------- quiet hours ---------- */

export interface Quiet {
  enabled: boolean;
  start: string;
  end: string;
  timezone: string;
}

const clock = (at: Date, zone: string): string =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at);

/** Is the moment inside the quiet hours of the time zone? The hours may cross midnight (22:00 to 08:00). */
export function inQuiet(now: Date, q: Quiet): boolean {
  if (!q.enabled) return false;
  const t = clock(now, q.timezone);
  return q.start < q.end ? t >= q.start && t < q.end : t >= q.start || t < q.end;
}

/** When the quiet hours that cover `now` end (the first moment a message may go out). */
export function quietEnds(now: Date, q: Quiet): Date {
  const today = localDay(now, q.timezone);
  const t = clock(now, q.timezone);
  const endToday = zonedToUtc(today, q.end, q.timezone);
  // Crossing midnight and already past the start: the end is tomorrow morning.
  if (q.start > q.end && t >= q.start) return zonedToUtc(addDays(today, 1), q.end, q.timezone);
  return endToday;
}

/* ---------- text ---------- */

/** Fills {client.name} and {client.contact_name}; anything else in braces stays as it is. */
export function renderClientText(
  text: string,
  client: { name: string; contactName: string },
): string {
  return text
    .replace(/\{client\.name\}/g, client.name)
    .replace(
      /\{client\.contact_name\}/g,
      client.contactName === '' ? client.name : client.contactName,
    );
}

/* ---------- A/B test ---------- */

/** A small stable hash (FNV-1a, 32 bit) so the same client always lands in the same place. */
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    // Multiply by the FNV prime 16777619 with shifts, so the result stays exact in 32 bits.
    h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
  }
  return h >>> 0;
}

export interface Split {
  /** Client id -> variant label, for the clients in the test group. */
  test: Map<string, string>;
  /** The clients who wait for the winner. */
  holdout: string[];
}

/**
 * Splits an audience: the test group is the given percent of the audience (at least one client for each variant when there are
 * enough clients), chosen by the stable hash and shared round robin among the variants; everyone else waits for the winner.
 */
export function splitAudience(
  clientIds: readonly string[],
  labels: readonly string[],
  testPercent: number,
  salt: string,
): Split {
  const ordered = [...clientIds].sort(
    (a, b) => hash32(`${salt}|${a}`) - hash32(`${salt}|${b}`) || a.localeCompare(b),
  );
  const wanted = floorDiv(ordered.length * testPercent, 100);
  const target = wanted < labels.length ? labels.length : wanted;
  const size = ordered.length < target ? ordered.length : target;
  const test = new Map<string, string>();
  ordered
    .slice(0, size)
    .forEach((id, i) => test.set(id, labels[i % labels.length] ?? labels[0] ?? 'A'));
  return { test, holdout: ordered.slice(size) };
}

export interface VariantStats {
  label: string;
  variantId: string;
  delivered: number;
  engaged: number;
}

/** A percentage with one decimal ("12.5") from two whole numbers; null with nothing delivered. */
export function rate(engaged: number, delivered: number): string | null {
  if (delivered <= 0) return null;
  const tenths = floorDiv(engaged * 1000, delivered);
  return `${floorDiv(tenths, 10)}.${tenths % 10}`;
}

/**
 * The winner rule. Only variants with at least `minSample` delivered messages count; the one with the highest share of engaged
 * (opened or read) messages wins; a tie goes to the earlier label. Shares are compared by cross multiplication, so there is no
 * rounding. With no variant at the minimum the test waits; when `final` (the extension ran out) the best variant of those with
 * at least one delivered message wins and the reason says the sample was small.
 */
export function pickWinner(
  stats: readonly VariantStats[],
  minSample: number,
  final: boolean,
): { variantId: string; label: string; reason: string } | null {
  const better = (a: VariantStats, b: VariantStats): boolean => {
    const left = a.engaged * b.delivered;
    const right = b.engaged * a.delivered;
    return left > right || (left === right && a.label < b.label);
  };
  const best = (list: readonly VariantStats[]): VariantStats | null =>
    list.reduce<VariantStats | null>((top, s) => (top === null || better(s, top) ? s : top), null);
  const enough = stats.filter((s) => s.delivered >= minSample);
  if (enough.length >= 2 || (enough.length === 1 && stats.length === 1)) {
    const w = best(enough);
    if (w)
      return {
        variantId: w.variantId,
        label: w.label,
        reason: `Variant ${w.label} had the highest share of opened or read messages (${rate(w.engaged, w.delivered) ?? '0.0'}% of ${w.delivered}).`,
      };
  }
  if (!final) return null;
  const w = best(stats.filter((s) => s.delivered > 0));
  if (w === null) return null;
  return {
    variantId: w.variantId,
    label: w.label,
    reason: `Variant ${w.label} was chosen with a small sample (${rate(w.engaged, w.delivered) ?? '0.0'}% of ${w.delivered}); fewer than ${minSample} messages were delivered for some variants.`,
  };
}

/* ---------- reports ---------- */

export interface CostRow {
  month: string;
  channel: string;
  cost: string;
}

/** Cost per month and channel, and the total per month, as exact USD text. */
export function monthlyCost(
  rows: readonly CostRow[],
): { month: string; email: string; whatsapp: string; total: string }[] {
  const months = new Map<string, { email: Money; whatsapp: Money }>();
  for (const r of rows) {
    const m = months.get(r.month) ?? { email: Money.zero(), whatsapp: Money.zero() };
    if (r.channel === 'email') m.email = m.email.add(Money.parse(r.cost));
    else if (r.channel === 'whatsapp') m.whatsapp = m.whatsapp.add(Money.parse(r.cost));
    months.set(r.month, m);
  }
  return [...months.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([month, m]) => ({
      month,
      email: m.email.toDbString(),
      whatsapp: m.whatsapp.toDbString(),
      total: m.email.add(m.whatsapp).toDbString(),
    }));
}

export interface ChannelRow {
  channel: string;
  sent: number;
  delivered: number;
  engaged: number;
}

export function channelReport(
  rows: readonly { channel: string | null; delivered: boolean; engaged: boolean }[],
): (ChannelRow & { deliveredRate: string | null; engagedRate: string | null })[] {
  const out = new Map<string, ChannelRow>();
  for (const r of rows) {
    if (r.channel === null) continue;
    const e = out.get(r.channel) ?? { channel: r.channel, sent: 0, delivered: 0, engaged: 0 };
    e.sent += 1;
    if (r.delivered) e.delivered += 1;
    if (r.engaged) e.engaged += 1;
    out.set(r.channel, e);
  }
  return [...out.values()]
    .sort((a, b) => a.channel.localeCompare(b.channel))
    .map((e) => ({
      ...e,
      deliveredRate: rate(e.delivered, e.sent),
      engagedRate: rate(e.engaged, e.delivered),
    }));
}

export const monthOf = (iso: string): string => iso.slice(0, 7);
export const asInt = (v: unknown): number => toInt(v);
