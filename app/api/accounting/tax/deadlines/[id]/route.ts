// path: app/api/accounting/tax/deadlines/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { removeDeadline, updateDeadline } from '@/services/taxfiling/filing';
import { deadlineUpdate } from '@/services/taxfiling/tax-rules';

const params = z.object({ id: z.string().uuid() }).strict();

export const PATCH = withApi(
  {
    id: 'accounting.tax.deadline_update',
    scope: 'tenant',
    permission: { action: 'accounting.tax.manage', resourceType: 'tax_filing' },
    params,
    body: deadlineUpdate,
    auditExempt: 'The tax service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await updateDeadline(actor, p.id, body) };
  },
);

export const DELETE = withApi(
  {
    id: 'accounting.tax.deadline_remove',
    scope: 'tenant',
    permission: { action: 'accounting.tax.manage', resourceType: 'tax_filing' },
    params,
    auditExempt: 'The tax service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await removeDeadline(actor, p.id);
    return { data: { ok: true } };
  },
);
