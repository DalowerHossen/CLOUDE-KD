// path: app/api/payroll/runs/[id]/payslips/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { generatePayslips } from '@/services/payroll/runs';

export const POST = withApi(
  {
    id: 'payroll.runs.payslips',
    scope: 'tenant',
    permission: { action: 'payroll.run.manage', resourceType: 'pay_run' },
    params: z.object({ id: z.string().uuid() }).strict(),
    idempotent: true,
    auditExempt: 'The pay run service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: { made: await generatePayslips(actor.companyId, params.id) } };
  },
);
