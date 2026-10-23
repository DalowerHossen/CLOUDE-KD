// path: app/api/hr/employees/[id]/terminate/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { terminateEmployee, terminateInput } from '@/services/hr/lifecycle';

export const POST = withApi(
  {
    id: 'hr.employees.terminate',
    scope: 'tenant',
    permission: { action: 'hr.manage', resourceType: 'employee' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: terminateInput,
    idempotent: true,
    stepUp: { maxAgeSeconds: 600 },
    auditExempt: 'The lifecycle service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await terminateEmployee(actor, params.id, body) };
  },
);
