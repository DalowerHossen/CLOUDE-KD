// path: app/api/time/submit/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { timeIdsSchema } from '@/lib/project/input';
import { submitEntries } from '@/services/project/time';

export const POST = withApi(
  {
    id: 'time.submit',
    scope: 'tenant',
    permission: { action: 'time.log', resourceType: 'time_entry' },
    body: timeIdsSchema,
    auditExempt: 'Time entries are audited by the database.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: { submitted: await submitEntries(actor, body.ids) } };
  },
);
