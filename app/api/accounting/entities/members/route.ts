// path: app/api/accounting/entities/members/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { memberInput } from '@/services/budget/consolidation-rules';
import { addMember } from '@/services/budget/entities';

export const POST = withApi(
  {
    id: 'accounting.entities.member_add',
    scope: 'tenant',
    permission: { action: 'accounting.entity.manage', resourceType: 'entity_group' },
    body: memberInput,
    stepUp: { maxAgeSeconds: 600 },
    auditExempt: 'The entity service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await addMember(actor, body) };
  },
);
