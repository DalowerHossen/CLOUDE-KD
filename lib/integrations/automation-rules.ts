// path: lib/integrations/automation-rules.ts
// Automation tools (Zapier, Make and the browser extension) as pure data and functions: the list of triggers, the inputs of the hook
// and note endpoints, the shape of a trigger item, and the summary of invoices. Zapier and Make use the same endpoints, so there is
// one set of rules for both. No database here.
import { z } from 'zod';
import { toInt } from '@/lib/reports/numbers';
import { Money } from '@/lib/utils/currency';
import { checkWebhookUrl } from './ssrf';
import type { WebhookEventName } from '@/config/s16-api';

export const TRIGGER_NAMES = [
  'invoice-paid',
  'client-created',
  'payment-received',
  'estimate-approved',
] as const;
export type TriggerName = (typeof TRIGGER_NAMES)[number];

export interface TriggerDef {
  name: TriggerName;
  /** The key scope needed to poll or subscribe. */
  scope: 'read:invoices' | 'read:clients' | 'read:payments' | 'read:estimates';
  /** The outgoing webhook event that a subscription to this trigger listens to. */
  event: WebhookEventName;
  title: string;
}

export const TRIGGERS: readonly TriggerDef[] = [
  { name: 'invoice-paid', scope: 'read:invoices', event: 'invoice.paid', title: 'Invoice paid' },
  { name: 'client-created', scope: 'read:clients', event: 'client.created', title: 'New client' },
  {
    name: 'payment-received',
    scope: 'read:payments',
    event: 'payment.captured',
    title: 'Payment received',
  },
  {
    name: 'estimate-approved',
    scope: 'read:estimates',
    event: 'estimate.approved',
    title: 'Estimate approved',
  },
];

export const triggerDef = (name: TriggerName): TriggerDef => {
  const found = TRIGGERS.find((t) => t.name === name);
  if (!found) throw new Error(`Unknown trigger ${name}`);
  return found;
};

const stamp = z.string();

export const pollQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    /** Only events after this time (ISO 8601). */
    since: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

/** One event of a trigger poll. Zapier and Make read `id` to tell new items from old ones. */
export const triggerItemOut = z.object({
  id: z.string().uuid(),
  event: z.string(),
  event_time: stamp,
  number: z.string().nullable(),
  client_id: z.string().uuid().nullable(),
  invoice_id: z.string().uuid().nullable(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  amount: z.string().nullable(),
  status: z.string(),
});
export type TriggerItem = z.infer<typeof triggerItemOut>;

const plainText = (max: number): z.ZodString =>
  z
    .string()
    .trim()
    .max(max)
    .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });

export const hookInput = z
  .object({
    target_url: z.string().superRefine((v, ctx) => {
      const check = checkWebhookUrl(v.trim());
      if (!check.ok) ctx.addIssue({ code: 'custom', message: check.reason });
    }),
    trigger: z.enum(TRIGGER_NAMES),
    source: z.enum(['zapier', 'make']),
  })
  .strict();

export const hookOut = z.object({
  id: z.string().uuid(),
  trigger: z.enum(TRIGGER_NAMES),
  source: z.enum(['zapier', 'make']),
  target_url: z.string(),
  signing_secret: z.string(),
});

export const hookParams = z.object({ id: z.string().uuid() }).strict();

export const noteInput = z
  .object({
    payment_id: z.string().uuid(),
    note: plainText(500).refine((v) => v.length > 0, { message: 'Write a note.' }),
  })
  .strict();

export const noteOut = z.object({
  payment_id: z.string().uuid(),
  notes: z.number().int(),
});

export const summaryOut = z.object({
  invoices_counted: z.number().int(),
  draft: z.number().int(),
  sent: z.number().int(),
  paid: z.number().int(),
  overdue: z.number().int(),
  amount_due: z.string(),
  currency: z.literal('USD'),
});
export type Summary = z.infer<typeof summaryOut>;

/** The trigger a webhook event belongs to (null for events that no trigger listens to). */
export function triggerForEvent(event: string): TriggerName | null {
  return TRIGGERS.find((t) => t.event === event)?.name ?? null;
}

/** Keeps the events after `since`, newest first, at most `limit`. Ties are ordered by id so the order is stable. */
export function newest<T extends { id: string; event_time: string }>(
  items: readonly T[],
  since: string | undefined,
  limit: number,
): T[] {
  const from = since === undefined ? -Infinity : Date.parse(since);
  return items
    .filter((i) => Date.parse(i.event_time) > from)
    .sort((a, b) => Date.parse(b.event_time) - Date.parse(a.event_time) || b.id.localeCompare(a.id))
    .slice(0, limit);
}

/** Counts invoices by state and totals what is still owed (open invoices only; void ones are left out). */
export function summarize(
  rows: readonly { status: string; amount_due: string; due_date: string | null }[],
  today: string,
): Summary {
  let due = Money.zero();
  const count = { draft: 0, sent: 0, paid: 0, overdue: 0 };
  for (const r of rows) {
    if (r.status === 'draft' || r.status === 'pending_approval') count.draft += 1;
    else if (r.status === 'paid') count.paid += 1;
    else if (r.status !== 'void') {
      count.sent += 1;
      due = due.add(Money.parse(r.amount_due));
      if (r.status === 'overdue' || (r.due_date !== null && r.due_date < today)) count.overdue += 1;
    }
  }
  return {
    invoices_counted: toInt(rows.length),
    ...count,
    amount_due: due.toDbString(),
    currency: 'USD',
  };
}
