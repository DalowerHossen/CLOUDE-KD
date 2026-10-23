// path: app/api/hr/leave/types/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { leaveTypeInput } from '@/services/hr/hr-rules';
import { createLeaveType, listLeaveTypes } from '@/services/hr/leave';

export const GET = withApi(
  {
    id: 'hr.leave.types',
    scope: 'tenant',
    permission: { action: 'hr.read', resourceType: 'leave' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listLeaveTypes(actor.companyId) };
  },
);

export const POST = withApi(
  {
    id: 'hr.leave.type_create',
    scope: 'tenant',
    permission: { action: 'hr.manage', resourceType: 'leave' },
    body: leaveTypeInput,
    auditExempt: 'The leave service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await createLeaveType(actor, body) };
  },
);
