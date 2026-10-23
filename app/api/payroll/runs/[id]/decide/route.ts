// path: app/api/payroll/runs/[id]/decide/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { decideInput } from '@/services/payroll/run-rules';
import { decideRun } from '@/services/payroll/runs';

export const POST = withApi(
  {
    id: 'payroll.runs.decide',
    scope: 'tenant',
    permission: { action: 'payroll.run.approve', resourceType: 'pay_run' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: decideInput,
    idempotent: true,
    stepUp: { maxAgeSeconds: 900 },
    auditExempt: 'The pay run service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await decideRun(actor, params.id, body) };
  },
);
