// path: app/api/payroll/runs/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { deleteRun, getRun } from '@/services/payroll/runs';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'payroll.runs.get',
    scope: 'tenant',
    permission: { action: 'payroll.run.read', resourceType: 'pay_run' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getRun(actor.companyId, p.id) };
  },
);

export const DELETE = withApi(
  {
    id: 'payroll.runs.delete',
    scope: 'tenant',
    permission: { action: 'payroll.run.manage', resourceType: 'pay_run' },
    params,
    auditExempt: 'The pay run service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await deleteRun(actor, p.id);
    return { data: { ok: true } };
  },
);
