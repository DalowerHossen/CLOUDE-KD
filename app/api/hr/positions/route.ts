// path: app/api/hr/positions/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { positionInput } from '@/services/hr/hr-rules';
import { createPosition } from '@/services/hr/org';

export const POST = withApi(
  {
    id: 'hr.positions.create',
    scope: 'tenant',
    permission: { action: 'hr.manage', resourceType: 'department' },
    body: positionInput,
    auditExempt: 'The organisation service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await createPosition(actor, body) };
  },
);
