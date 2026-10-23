// path: app/api/accounting/tax/payments/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { removePayment } from '@/services/taxfiling/filing';

export const DELETE = withApi(
  {
    id: 'accounting.tax.payment_remove',
    scope: 'tenant',
    permission: { action: 'accounting.tax.manage', resourceType: 'tax_filing' },
    params: z.object({ id: z.string().uuid() }).strict(),
    auditExempt: 'The tax service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await removePayment(actor, params.id);
    return { data: { ok: true } };
  },
);
