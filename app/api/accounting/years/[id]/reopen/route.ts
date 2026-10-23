// path: app/api/accounting/years/[id]/reopen/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { reopenInput } from '@/services/accounting/period-rules';
import { reopenYear } from '@/services/accounting/periods';

export const POST = withApi(
  {
    id: 'accounting.years.reopen',
    scope: 'tenant',
    permission: { action: 'accounting.period.reopen', resourceType: 'fiscal_year' },
    stepUp: { maxAgeSeconds: 600 },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: reopenInput,
    idempotent: true,
    auditExempt: 'The period service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await reopenYear(actor, params.id, body) };
  },
);
