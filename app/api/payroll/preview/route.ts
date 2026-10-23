// path: app/api/payroll/preview/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { previewInput, previewPay } from '@/services/payroll/preview';

export const POST = withApi(
  {
    id: 'payroll.preview',
    scope: 'tenant',
    permission: { action: 'payroll.pay.read', resourceType: 'employee' },
    body: previewInput,
    auditExempt: 'The preview service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await previewPay(actor, body) };
  },
);
