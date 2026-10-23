// path: app/api/accounting/periods/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { dayText } from '@/services/accounting/journal-rules';
import { listYears, setupYears } from '@/services/accounting/periods';

export const GET = withApi(
  {
    id: 'accounting.periods.list',
    scope: 'tenant',
    permission: { action: 'accounting.read', resourceType: 'fiscal_period' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listYears(actor.companyId) };
  },
);

export const POST = withApi(
  {
    id: 'accounting.periods.setup',
    scope: 'tenant',
    permission: { action: 'accounting.period.manage', resourceType: 'fiscal_period' },
    body: z.strictObject({ date: dayText }),
    auditExempt: 'The period service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await setupYears(actor, body.date) };
  },
);
