// path: app/api/accounting/entities/pairs/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { removePair } from '@/services/budget/entities';

export const DELETE = withApi(
  {
    id: 'accounting.entities.pair_remove',
    scope: 'tenant',
    permission: { action: 'accounting.entity.manage', resourceType: 'entity_group' },
    params: z.object({ id: z.string().uuid() }).strict(),
    auditExempt: 'The entity service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await removePair(actor, params.id) };
  },
);
