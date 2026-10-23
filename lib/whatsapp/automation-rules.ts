// path: lib/whatsapp/automation-rules.ts
// WhatsApp rules and campaigns as pure functions: the inputs, the tokens that fill a template from an invoice, payment or client,
// the audience of a campaign (segment), the daily limit, which failures can be retried, and when a campaign is finished. No
// database or network here.
import { z } from 'zod';
import {
  CAMPAIGN_MAX_AUDIENCE,
  CLIENT_TOKENS,
  INVOICE_TOKENS,
  PAYMENT_TOKENS,
  PERMANENT_ERROR_CODES,
  RULE_EVENTS,
  RULE_MAX_DELAY_MINUTES,
} from '@/config/s16-whatsapp';
import { Money } from '@/lib/utils/currency';

const plain = (min: number, max: number): z.ZodEffects<z.ZodString, string, string> =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });
const money = z.string().regex(/^\d{1,14}(\.\d{1,4})?$/, 'Use an amount like 12.5.');
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-01-31.');

/* ---------- tokens ---------- */

const TOKEN = /\{([a-z_]+\.[a-z_]+)\}/g;

export const tokensIn = (text: string): string[] =>
  [...text.matchAll(TOKEN)].map((m) => m[1] ?? '');

/** Tokens a rule may use: always the client; the invoice for invoice, payment and due-date rules; the payment for payment rules. */
export function allowedTokens(trigger: {
  kind: 'event' | 'due_soon';
  event?: string | null;
}): readonly string[] {
  if (trigger.kind === 'due_soon') return [...CLIENT_TOKENS, ...INVOICE_TOKENS];
  const event = trigger.event ?? '';
  if (event.startsWith('payment.')) return [...CLIENT_TOKENS, ...INVOICE_TOKENS, ...PAYMENT_TOKENS];
  if (event.startsWith('invoice.')) return [...CLIENT_TOKENS, ...INVOICE_TOKENS];
  return [...CLIENT_TOKENS];
}

/** The first token of the values that is not allowed, or null. */
export function tokenProblem(
  values: Readonly<Record<string, string>>,
  allowed: readonly string[],
): string | null {
  for (const v of Object.values(values))
    for (const t of tokensIn(v)) if (!allowed.includes(t)) return `{${t}} cannot be used here.`;
  return null;
}

export type TokenContext = Readonly<Record<string, string>>;

/** Fills the tokens of each value from the context. `empty` lists the placeholders that ended up empty. */
export function fillValues(
  valueMap: Readonly<Record<string, string>>,
  context: TokenContext,
): { values: Record<string, string>; empty: string[] } {
  const values: Record<string, string> = {};
  const empty: string[] = [];
  for (const [key, raw] of Object.entries(valueMap)) {
    const filled = raw.replace(TOKEN, (_m, token: string) => context[token] ?? '').trim();
    values[key] = filled;
    if (filled === '') empty.push(key);
  }
  return { values, empty };
}

/* ---------- inputs ---------- */

const valueMap = z
  .record(plain(0, 500))
  .refine((v) => Object.keys(v).length <= 30, { message: 'Too many values.' });

const ruleBase = z.object({
  name: plain(1, 100),
  triggerKind: z.enum(['event', 'due_soon']),
  eventName: z.enum(RULE_EVENTS).nullable().default(null),
  daysBefore: z.number().int().min(0).max(60).nullable().default(null),
  templateId: z.string().uuid(),
  values: valueMap.default({}),
  enabled: z.boolean().default(false),
  dryRun: z.boolean().default(true),
  delayMinutes: z.number().int().min(0).max(RULE_MAX_DELAY_MINUTES).default(0),
});

/** The first problem with the trigger fields of a rule, or null. */
export function ruleProblem(v: {
  triggerKind: 'event' | 'due_soon';
  eventName: string | null;
  daysBefore: number | null;
  values: Readonly<Record<string, string>>;
}): { path: string; message: string } | null {
  if (v.triggerKind === 'event' && v.eventName === null)
    return { path: 'eventName', message: 'Choose the event.' };
  if (v.triggerKind === 'event' && v.daysBefore !== null)
    return { path: 'daysBefore', message: 'An event rule has no number of days.' };
  if (v.triggerKind === 'due_soon' && v.daysBefore === null)
    return { path: 'daysBefore', message: 'Say how many days before the due date.' };
  if (v.triggerKind === 'due_soon' && v.eventName !== null)
    return { path: 'eventName', message: 'A due date rule has no event.' };
  const bad = tokenProblem(v.values, allowedTokens({ kind: v.triggerKind, event: v.eventName }));
  return bad ? { path: 'values', message: bad } : null;
}

export const ruleInput = ruleBase.strict().superRefine((v, ctx) => {
  const p = ruleProblem(v);
  if (p) ctx.addIssue({ code: 'custom', path: [p.path], message: p.message });
});

export const ruleUpdate = z
  .object({
    version: z.number().int().min(1),
    name: plain(1, 100).optional(),
    templateId: z.string().uuid().optional(),
    values: valueMap.optional(),
    enabled: z.boolean().optional(),
    dryRun: z.boolean().optional(),
    delayMinutes: z.number().int().min(0).max(RULE_MAX_DELAY_MINUTES).optional(),
  })
  .strict();

export const segmentInput = z
  .object({
    tags: z.array(plain(1, 40)).max(20).default([]),
    minBalance: money.nullable().default(null),
    maxBalance: money.nullable().default(null),
    lastInvoiceBefore: day.nullable().default(null),
    hasOpenInvoices: z.boolean().nullable().default(null),
    optedInOnly: z.boolean().default(true),
  })
  .strict()
  .refine(
    (v) =>
      v.minBalance === null || v.maxBalance === null || Money.parse(v.minBalance).lte(v.maxBalance),
    {
      message: 'The lowest balance cannot be above the highest.',
      path: ['minBalance'],
    },
  );

export type Segment = z.infer<typeof segmentInput>;

export const campaignInput = z
  .object({
    name: plain(1, 100),
    templateId: z.string().uuid(),
    values: valueMap.default({}),
    segment: segmentInput.default({}),
    dryRun: z.boolean().default(true),
    scheduledAt: z.string().datetime({ offset: true }).nullable().default(null),
  })
  .strict()
  .superRefine((v, ctx) => {
    const bad = tokenProblem(v.values, CLIENT_TOKENS);
    if (bad) ctx.addIssue({ code: 'custom', path: ['values'], message: bad });
  });

/* ---------- audience ---------- */

export interface AudienceClient {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  tags: readonly string[];
  doNotContact: boolean;
}

export interface ClientStats {
  /** Sum of the amounts due on open invoices. */
  balance: string;
  openInvoices: number;
  lastInvoiceDate: string | null;
}

/** Does a client belong to the segment (tags, balance, last invoice, open invoices)? */
export function inSegment(client: AudienceClient, stats: ClientStats, seg: Segment): boolean {
  if (seg.tags.length > 0 && !seg.tags.some((t) => client.tags.includes(t))) return false;
  const balance = Money.parse(stats.balance);
  if (seg.minBalance !== null && balance.lt(seg.minBalance)) return false;
  if (seg.maxBalance !== null && balance.gt(seg.maxBalance)) return false;
  if (
    seg.lastInvoiceBefore !== null &&
    stats.lastInvoiceDate !== null &&
    stats.lastInvoiceDate >= seg.lastInvoiceBefore
  )
    return false;
  if (seg.hasOpenInvoices !== null && seg.hasOpenInvoices !== stats.openInvoices > 0) return false;
  return true;
}

export interface AudienceEntry {
  clientId: string;
  phone: string;
  name: string;
  status: 'pending' | 'skipped';
  reason: string | null;
}

/**
 * The people of a campaign, one row per phone number (the first client with a number wins). A client who does not want contact,
 * has no valid number, or has not opted in (when the segment asks for opted-in people) is kept as a skipped row with the reason,
 * so the owner can see who was left out.
 */
export function buildAudience(
  clients: readonly (AudienceClient & { stats: ClientStats })[],
  seg: Segment,
  toNumber: (raw: string) => string | null,
  optStatus: (phone: string) => 'opted_in' | 'opted_out' | 'unknown',
): AudienceEntry[] {
  const out: AudienceEntry[] = [];
  const seen = new Set<string>();
  for (const c of clients) {
    if (out.length >= CAMPAIGN_MAX_AUDIENCE) break;
    if (!inSegment(c, c.stats, seg)) continue;
    const phone = toNumber(c.phone);
    if (phone === null) {
      out.push({
        clientId: c.id,
        phone: '',
        name: c.name,
        status: 'skipped',
        reason: 'The client has no valid WhatsApp number.',
      });
      continue;
    }
    if (seen.has(phone)) continue;
    seen.add(phone);
    const base = { clientId: c.id, phone, name: c.name };
    const opt = optStatus(phone);
    if (c.doNotContact)
      out.push({ ...base, status: 'skipped', reason: 'The client asked not to be contacted.' });
    else if (opt === 'opted_out')
      out.push({ ...base, status: 'skipped', reason: 'The person opted out of messages.' });
    else if (seg.optedInOnly && opt !== 'opted_in')
      out.push({ ...base, status: 'skipped', reason: 'The person has not opted in.' });
    else out.push({ ...base, status: 'pending', reason: null });
  }
  return out.filter((e) => e.phone !== '');
}

/* ---------- limits, retries, finish ---------- */

/** How many more people may be started on a conversation today. */
export const remainingToday = (dailyLimit: number, usedLast24h: number): number =>
  Math.max(dailyLimit - usedLast24h, 0);

export const isPermanentFailure = (code: number | null): boolean =>
  code !== null && PERMANENT_ERROR_CODES.includes(code);

export interface ItemCounts {
  pending: number;
  sent: number;
  failed: number;
  skipped: number;
  dryRun: number;
}

export const campaignFinished = (c: ItemCounts): boolean => c.pending === 0;

/** Messages "sent" below this share of the audience are reported as a low delivery share in the report. */
export function deliveryShare(delivered: number, sent: number): string {
  if (sent === 0) return '0';
  const { integer, fraction } = Money.parse(String(delivered))
    .mul('100')
    .div(String(sent))
    .toParts(1);
  return `${integer}.${fraction}`;
}

/** When a delayed run is due. */
export const runDueAt = (occurredAt: string, delayMinutes: number): string =>
  new Date(Date.parse(occurredAt) + delayMinutes * 60_000).toISOString();

/** The due date that a due-date rule looks for today. */
export function dueDateFor(today: string, daysBefore: number): string {
  return new Date(Date.parse(`${today}T00:00:00Z`) + daysBefore * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** The documented Meta limit text (for example TIER_250, TIER_2K, TIER_UNLIMITED) as a number, or null when it is not understood. */
export function parseMessagingLimit(text: string): number | null {
  const m = /^TIER_(\d+)(K)?$/i.exec(text.trim());
  if (m) return Number.parseInt(m[1] ?? '0', 10) * (m[2] ? 1000 : 1);
  if (/^TIER_UNLIMITED$/i.test(text.trim())) return 1_000_000;
  return null;
}
