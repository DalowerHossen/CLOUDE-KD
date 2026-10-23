// path: app/api/time/decide/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { timeDecisionSchema } from '@/lib/project/input';
import { decideEntries } from '@/services/project/time';

export const POST = withApi(
  {
    id: 'time.decide',
    scope: 'tenant',
    permission: { action: 'time.log', resourceType: 'time_entry' },
    body: timeDecisionSchema,
    auditExempt: 'The time service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: { decided: await decideEntries(actor, body.ids, body) } };
  },
);
