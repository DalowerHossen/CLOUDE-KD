// path: app/api/accounting/reconciliation/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { reconciliationState } from '@/services/reconciliation/reconcile';

export const GET = withApi(
  {
    id: 'bank.reconciliations.state',
    scope: 'tenant',
    permission: { action: 'accounting.read', resourceType: 'bank_account' },
    params: z.object({ id: z.string().uuid() }).strict(),
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await reconciliationState(actor.companyId, params.id) };
  },
);
