// path: app/api/wallet/bnpl/plans/[id]/cancel/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { cancelPlan } from '@/services/bnpl/installments';

export const POST = withApi(
  {
    id: 'bnpl.cancel',
    scope: 'tenant',
    permission: { action: 'client_subscription.manage', resourceType: 'bnpl' },
    params: z.object({ id: z.string().uuid() }).strict(),
    auditExempt: 'The installment service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await cancelPlan(actor, params.id);
    return { data: { cancelled: true } };
  },
);
