// path: app/api/payroll/components/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { componentInput } from '@/services/payroll/payroll-rules';
import { createComponent } from '@/services/payroll/structures';

export const POST = withApi(
  {
    id: 'payroll.components.create',
    scope: 'tenant',
    permission: { action: 'payroll.settings.manage', resourceType: 'salary_component' },
    body: componentInput,
    auditExempt: 'The structure service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await createComponent(actor, body) };
  },
);
