// path: app/api/payroll/runs/[id]/pay/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { payInput } from '@/services/payroll/run-rules';
import { markPaid } from '@/services/payroll/runs';

export const POST = withApi(
  {
    id: 'payroll.runs.pay',
    scope: 'tenant',
    permission: { action: 'payroll.run.pay', resourceType: 'pay_run' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: payInput,
    idempotent: true,
    stepUp: { maxAgeSeconds: 600 },
    auditExempt: 'The pay run service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await markPaid(actor, params.id, body) };
  },
);
