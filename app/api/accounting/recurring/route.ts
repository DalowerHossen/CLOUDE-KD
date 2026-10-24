// path: app/api/accounting/recurring/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { recurringInput } from '@/services/accounting/period-rules';
import { createRecurring, listRecurring } from '@/services/accounting/recurring';

export const GET = withApi(
  {
    id: 'accounting.recurring.list',
    scope: 'tenant',
    permission: { action: 'accounting.read', resourceType: 'recurring_journal' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listRecurring(actor.companyId) };
  },
);

export const POST = withApi(
  {
    id: 'accounting.recurring.create',
    scope: 'tenant',
    permission: { action: 'accounting.period.manage', resourceType: 'recurring_journal' },
    body: recurringInput,
    auditExempt: 'The recurring service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await createRecurring(actor, body) };
  },
);
