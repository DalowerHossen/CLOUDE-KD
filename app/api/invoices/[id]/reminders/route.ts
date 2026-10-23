// path: app/api/invoices/[id]/reminders/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { plain } from '@/lib/crm/clients';
import { holdSchema } from '@/lib/schedule/input';
import {
  addHold,
  listHolds,
  listReminderLog,
  releaseHolds,
  sendReminderNow,
} from '@/services/invoice/reminders';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'invoices.reminders',
    scope: 'tenant',
    permission: { action: 'invoice.read', resourceType: 'invoice' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    const [log, holds] = await Promise.all([
      listReminderLog(actor.companyId, p.id),
      listHolds(actor.companyId, p.id),
    ]);
    return { data: { log, holds } };
  },
);

/** Send a reminder now. */
export const POST = withApi(
  {
    id: 'invoices.sendReminder',
    scope: 'tenant',
    permission: { action: 'reminder.send', resourceType: 'invoice' },
    params,
    body: z.object({ message: plain(0, 1000) }).strict(),
    rateLimitPolicy: 'strict',
    auditExempt: 'The reminder is written to the invoice timeline.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    await sendReminderNow(actor, p.id, body.message);
    return { data: { id: p.id } };
  },
);

/** Record a promise to pay, or pause reminders. */
export const PUT = withApi(
  {
    id: 'invoices.holdReminders',
    scope: 'tenant',
    permission: { action: 'reminder.send', resourceType: 'invoice' },
    params,
    body: holdSchema,
    auditExempt: 'The hold is written to the invoice timeline.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await addHold(actor, p.id, body) };
  },
);

/** Resume reminders (releases promises and pauses). */
export const DELETE = withApi(
  {
    id: 'invoices.resumeReminders',
    scope: 'tenant',
    permission: { action: 'reminder.send', resourceType: 'invoice' },
    params,
    auditExempt: 'The release is written to the invoice timeline.',
  },
  async ({ actor, params: p }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await releaseHolds(actor, p.id) };
  },
);
