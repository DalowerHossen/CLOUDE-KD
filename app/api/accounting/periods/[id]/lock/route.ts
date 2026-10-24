// path: app/api/accounting/periods/[id]/lock/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { moduleLockInput } from '@/services/accounting/period-rules';
import { setModuleLock } from '@/services/accounting/periods';

export const POST = withApi(
  {
    id: 'accounting.periods.lock',
    scope: 'tenant',
    permission: { action: 'accounting.period.manage', resourceType: 'fiscal_period' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: moduleLockInput,
    auditExempt: 'The period service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await setModuleLock(actor, params.id, body) };
  },
);
