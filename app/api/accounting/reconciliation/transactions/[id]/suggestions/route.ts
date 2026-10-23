// path: app/api/accounting/reconciliation/transactions/[id]/suggestions/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { suggestionsFor } from '@/services/reconciliation/matching';

export const GET = withApi(
  {
    id: 'bank.suggestions',
    scope: 'tenant',
    permission: { action: 'accounting.read', resourceType: 'bank_account' },
    params: z.object({ id: z.string().uuid() }).strict(),
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await suggestionsFor(actor.companyId, params.id) };
  },
);
