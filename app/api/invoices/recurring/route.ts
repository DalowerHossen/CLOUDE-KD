// path: app/api/invoices/recurring/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { recurringInputSchema } from '@/lib/schedule/input';
import { createSchedule, listSchedules } from '@/services/invoice/recurring';

export const GET = withApi(
  {
    id: 'recurring.list',
    scope: 'tenant',
    permission: { action: 'recurring.read', resourceType: 'recurring_schedule' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listSchedules(actor.companyId) };
  },
);

export const POST = withApi(
  {
    id: 'recurring.create',
    scope: 'tenant',
    permission: { action: 'recurring.manage', resourceType: 'recurring_schedule' },
    body: recurringInputSchema,
    maxBodyBytes: 5_000_000,
    idempotent: true,
    auditExempt: 'The recurring service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await createSchedule(actor, body) };
  },
);
