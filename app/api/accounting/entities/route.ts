// path: app/api/accounting/entities/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { groupInput } from '@/services/budget/consolidation-rules';
import { createGroup, getGroup } from '@/services/budget/entities';

export const GET = withApi(
  {
    id: 'accounting.entities.get',
    scope: 'tenant',
    permission: { action: 'accounting.entity.manage', resourceType: 'entity_group' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getGroup(actor.companyId) };
  },
);

export const POST = withApi(
  {
    id: 'accounting.entities.create',
    scope: 'tenant',
    permission: { action: 'accounting.entity.manage', resourceType: 'entity_group' },
    body: groupInput,
    auditExempt: 'The entity service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await createGroup(actor, body) };
  },
);
