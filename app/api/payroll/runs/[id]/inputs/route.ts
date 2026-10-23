// path: app/api/payroll/runs/[id]/inputs/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { itemInput } from '@/services/payroll/run-rules';
import { setInputs } from '@/services/payroll/runs';

export const PUT = withApi(
  {
    id: 'payroll.runs.inputs',
    scope: 'tenant',
    permission: { action: 'payroll.run.manage', resourceType: 'pay_run' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: itemInput,
    auditExempt: 'The pay run service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await setInputs(actor, params.id, body) };
  },
);
