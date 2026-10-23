// path: app/api/hr/leave/requests/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { leaveRequestInput } from '@/services/hr/hr-rules';
import { createRequest, listRequests } from '@/services/hr/leave';

export const GET = withApi(
  {
    id: 'hr.leave.requests',
    scope: 'tenant',
    permission: { action: 'hr.read', resourceType: 'leave' },
    query: z.strictObject({
      employeeId: z.string().uuid().optional(),
      status: z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional(),
    }),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return {
      data: await listRequests(actor.companyId, {
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
        ...(query.status ? { status: query.status } : {}),
      }),
    };
  },
);

export const POST = withApi(
  {
    id: 'hr.leave.request_create',
    scope: 'tenant',
    permission: { action: 'hr.manage', resourceType: 'leave' },
    body: leaveRequestInput,
    idempotent: true,
    auditExempt: 'The leave service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await createRequest(actor, body) };
  },
);
