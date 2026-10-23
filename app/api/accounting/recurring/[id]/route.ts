// path: app/api/accounting/recurring/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { removeRecurring, setRecurringStatus } from '@/services/accounting/recurring';

export const PATCH = withApi(
  {
    id: 'accounting.recurring.status',
    scope: 'tenant',
    permission: { action: 'accounting.period.manage', resourceType: 'recurring_journal' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.strictObject({ status: z.enum(['active', 'paused']) }),
    auditExempt: 'The recurring service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await setRecurringStatus(actor, params.id, body.status) };
  },
);

export const DELETE = withApi(
  {
    id: 'accounting.recurring.remove',
    scope: 'tenant',
    permission: { action: 'accounting.period.manage', resourceType: 'recurring_journal' },
    params: z.object({ id: z.string().uuid() }).strict(),
    auditExempt: 'The recurring service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await removeRecurring(actor, params.id);
    return { data: { removed: true } };
  },
);
