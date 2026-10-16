// path: lib/helpdesk/rules.ts
// Support ticket rules and input shapes. Safe to import in the browser.
import { z } from 'zod';

export const CATEGORIES = [
  'question',
  'billing',
  'payments',
  'technical',
  'account',
  'other',
] as const;
export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export const STATUSES = ['open', 'pending', 'resolved', 'closed'] as const;
export type Priority = (typeof PRIORITIES)[number];
export type TicketStatus = (typeof STATUSES)[number];

/** Hours to the first answer and to the solution, by priority. */
export const SLA_HOURS: Readonly<Record<Priority, { first: number; resolve: number }>> = {
  urgent: { first: 1, resolve: 8 },
  high: { first: 4, resolve: 24 },
  normal: { first: 8, resolve: 48 },
  low: { first: 24, resolve: 96 },
};
/** A solved ticket closes by itself after this many days without a new message. */
export const AUTO_CLOSE_DAYS = 7;

export function dueDates(priority: Priority, from: Date): { first: Date; resolve: Date } {
  const h = SLA_HOURS[priority];
  return {
    first: new Date(from.getTime() + h.first * 3_600_000),
    resolve: new Date(from.getTime() + h.resolve * 3_600_000),
  };
}

export type SlaState = 'ok' | 'at_risk' | 'breached' | 'met';

/** First-answer clock: met once answered; at risk in the last quarter of the time; breached when late. */
export function firstResponseState(
  createdAt: Date,
  dueAt: Date,
  respondedAt: Date | null,
  now: Date,
): SlaState {
  if (respondedAt) return respondedAt <= dueAt ? 'met' : 'breached';
  if (now > dueAt) return 'breached';
  const total = dueAt.getTime() - createdAt.getTime();
  return dueAt.getTime() - now.getTime() <= total / 4 ? 'at_risk' : 'ok';
}

const plain = (min: number, max: number): z.ZodEffects<z.ZodString, string, string> =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });
const uuid = z.string().uuid();

export const createTicketSchema = z
  .object({
    subject: plain(3, 200),
    category: z.enum(CATEGORIES),
    priority: z.enum(['low', 'normal', 'high']),
    body: plain(1, 5000),
  })
  .strict();
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const ownTicketActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('reply'), body: plain(1, 5000) }).strict(),
  z.object({ action: z.literal('close') }).strict(),
  z.object({ action: z.literal('reopen') }).strict(),
  z.object({ action: z.literal('rate'), rating: z.number().int().min(1).max(5) }).strict(),
]);
export type OwnTicketAction = z.infer<typeof ownTicketActionSchema>;

export const agentTicketActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('reply'), body: plain(1, 5000), internal: z.boolean() }).strict(),
  z.object({ action: z.literal('claim') }).strict(),
  z.object({ action: z.literal('assign'), assigneeId: uuid.nullable() }).strict(),
  z.object({ action: z.literal('status'), status: z.enum(STATUSES) }).strict(),
  z.object({ action: z.literal('priority'), priority: z.enum(PRIORITIES) }).strict(),
]);
export type AgentTicketAction = z.infer<typeof agentTicketActionSchema>;

export const ownListQuery = z.object({ status: z.enum(['open', 'closed']).optional() }).strict();
export const queueQuery = z
  .object({
    view: z.enum(['unassigned', 'mine', 'all', 'overdue']).default('unassigned'),
    status: z.enum(STATUSES).optional(),
    q: z.string().trim().max(80).optional(),
    page: z.coerce.number().int().min(1).max(1000).default(1),
  })
  .strict();
export type QueueQuery = z.infer<typeof queueQuery>;
export const QUEUE_PAGE_SIZE = 25;
