// path: app/api/accounting/entities/pairs/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { pairInput } from '@/services/budget/consolidation-rules';
import { addPair } from '@/services/budget/entities';

export const POST = withApi(
  {
    id: 'accounting.entities.pair_add',
    scope: 'tenant',
    permission: { action: 'accounting.entity.manage', resourceType: 'entity_group' },
    body: pairInput,
    auditExempt: 'The entity service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await addPair(actor, body) };
  },
);
