// path: app/api/hr/leave/requests/[id]/decide/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { leaveDecideInput } from '@/services/hr/hr-rules';
import { decideRequest } from '@/services/hr/leave';

export const POST = withApi(
  {
    id: 'hr.leave.request_decide',
    scope: 'tenant',
    permission: { action: 'hr.leave.decide', resourceType: 'leave' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: leaveDecideInput,
    idempotent: true,
    auditExempt: 'The leave service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await decideRequest(actor, params.id, body) };
  },
);
