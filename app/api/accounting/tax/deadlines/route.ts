// path: app/api/accounting/tax/deadlines/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { addDeadline, listDeadlines } from '@/services/taxfiling/filing';
import { deadlineInput } from '@/services/taxfiling/tax-rules';

export const GET = withApi(
  {
    id: 'accounting.tax.deadlines',
    scope: 'tenant',
    permission: { action: 'accounting.read', resourceType: 'tax_filing' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listDeadlines(actor.companyId) };
  },
);

export const POST = withApi(
  {
    id: 'accounting.tax.deadline_add',
    scope: 'tenant',
    permission: { action: 'accounting.tax.manage', resourceType: 'tax_filing' },
    body: deadlineInput,
    auditExempt: 'The tax service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await addDeadline(actor, body) };
  },
);
