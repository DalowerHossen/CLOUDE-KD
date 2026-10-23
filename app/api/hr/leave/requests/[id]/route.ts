// path: app/api/hr/leave/requests/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { cancelRequest } from '@/services/hr/leave';

export const DELETE = withApi(
  {
    id: 'hr.leave.request_cancel',
    scope: 'tenant',
    permission: { action: 'hr.leave.decide', resourceType: 'leave' },
    params: z.object({ id: z.string().uuid() }).strict(),
    auditExempt: 'The leave service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await cancelRequest(actor, params.id);
    return { data: { ok: true } };
  },
);
