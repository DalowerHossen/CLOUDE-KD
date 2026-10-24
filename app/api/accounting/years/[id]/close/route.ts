// path: app/api/accounting/years/[id]/close/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { closeInput } from '@/services/accounting/period-rules';
import { closeYear } from '@/services/accounting/periods';

export const POST = withApi(
  {
    id: 'accounting.years.close',
    scope: 'tenant',
    permission: { action: 'accounting.period.manage', resourceType: 'fiscal_year' },
    stepUp: { maxAgeSeconds: 600 },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: closeInput,
    idempotent: true,
    auditExempt: 'The period service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await closeYear(actor, params.id, body.note) };
  },
);
