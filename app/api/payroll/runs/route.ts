// path: app/api/payroll/runs/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { createRun, listRuns } from '@/services/payroll/runs';
import { runInput } from '@/services/payroll/run-rules';

export const GET = withApi(
  {
    id: 'payroll.runs.list',
    scope: 'tenant',
    permission: { action: 'payroll.run.read', resourceType: 'pay_run' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listRuns(actor.companyId) };
  },
);

export const POST = withApi(
  {
    id: 'payroll.runs.create',
    scope: 'tenant',
    permission: { action: 'payroll.run.manage', resourceType: 'pay_run' },
    body: runInput,
    idempotent: true,
    auditExempt: 'The pay run service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await createRun(actor, body) };
  },
);
