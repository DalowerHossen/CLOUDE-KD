// path: app/api/hr/leave/types/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { setLeaveTypeStatus } from '@/services/hr/leave';

export const PATCH = withApi(
  {
    id: 'hr.leave.type_status',
    scope: 'tenant',
    permission: { action: 'hr.manage', resourceType: 'leave' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.strictObject({
      version: z.number().int().min(1),
      status: z.enum(['active', 'inactive']),
    }),
    auditExempt: 'The leave service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await setLeaveTypeStatus(actor, params.id, body.version, body.status);
    return { data: { ok: true } };
  },
);
