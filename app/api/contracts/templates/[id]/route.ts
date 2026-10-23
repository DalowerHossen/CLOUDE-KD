// path: app/api/contracts/templates/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { deleteTemplate } from '@/services/contract/templates';

const params = z.object({ id: z.string().uuid() }).strict();

export const DELETE = withApi(
  {
    id: 'contracts.templates.delete',
    scope: 'tenant',
    permission: { action: 'contract.create', resourceType: 'contract' },
    params,
    auditExempt: 'The database audit trigger records the change.',
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await deleteTemplate(actor, p.id);
    return { data: { id: p.id } };
  },
);
