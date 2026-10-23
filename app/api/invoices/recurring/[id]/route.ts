// path: app/api/invoices/recurring/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { recurringActionSchema, recurringUpdateSchema } from '@/lib/schedule/input';
import {
  getSchedule,
  type RunResult,
  type ScheduleView,
  runNow,
  setScheduleStatus,
  trashSchedule,
  updateSchedule,
} from '@/services/invoice/recurring';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'recurring.get',
    scope: 'tenant',
    permission: { action: 'recurring.read', resourceType: 'recurring_schedule' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getSchedule(actor.companyId, p.id) };
  },
);

export const PUT = withApi(
  {
    id: 'recurring.update',
    scope: 'tenant',
    permission: { action: 'recurring.manage', resourceType: 'recurring_schedule' },
    params,
    body: recurringUpdateSchema,
    maxBodyBytes: 5_000_000,
    auditExempt: 'The recurring service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await updateSchedule(actor, p.id, body.expectedVersion, body.schedule) };
  },
);

/** pause, resume, end, or make the next invoice now. */
export const POST = withApi(
  {
    id: 'recurring.action',
    scope: 'tenant',
    permission: { action: 'recurring.manage', resourceType: 'recurring_schedule' },
    params,
    body: recurringActionSchema,
    rateLimitPolicy: 'strict',
    auditExempt: 'The recurring service writes the audit entry.',
  },
  async ({ actor, params: p, body }): Promise<{ data: RunResult | ScheduleView }> => {
    if (!actor) throw new ForbiddenError();
    if (body.action === 'run_now') return { data: await runNow(actor, p.id) };
    return { data: await setScheduleStatus(actor, p.id, body.action) };
  },
);

export const DELETE = withApi(
  {
    id: 'recurring.delete',
    scope: 'tenant',
    permission: { action: 'recurring.manage', resourceType: 'recurring_schedule' },
    params,
    auditExempt: 'The recurring service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor) throw new ForbiddenError();
    await trashSchedule(actor, p.id);
    return { data: { id: p.id } };
  },
);
