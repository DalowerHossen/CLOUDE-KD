// path: app/api/hr/departments/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { departmentInput } from '@/services/hr/hr-rules';
import { createDepartment } from '@/services/hr/org';

export const POST = withApi(
  {
    id: 'hr.departments.create',
    scope: 'tenant',
    permission: { action: 'hr.manage', resourceType: 'department' },
    body: departmentInput,
    auditExempt: 'The organisation service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await createDepartment(actor, body) };
  },
);
