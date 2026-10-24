// path: app/api/payroll/components/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { setComponentStatus } from '@/services/payroll/structures';

export const PATCH = withApi(
  {
    id: 'payroll.components.status',
    scope: 'tenant',
    permission: { action: 'payroll.settings.manage', resourceType: 'salary_component' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.strictObject({
      version: z.number().int().min(1),
      status: z.enum(['active', 'inactive']),
    }),
    auditExempt: 'The structure service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await setComponentStatus(actor, params.id, body.version, body.status) };
  },
);
