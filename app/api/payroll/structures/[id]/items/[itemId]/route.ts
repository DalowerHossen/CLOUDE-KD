// path: app/api/payroll/structures/[id]/items/[itemId]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { removeStructureItem } from '@/services/payroll/structures';

export const DELETE = withApi(
  {
    id: 'payroll.structures.item_remove',
    scope: 'tenant',
    permission: { action: 'payroll.settings.manage', resourceType: 'salary_structure' },
    params: z.object({ id: z.string().uuid(), itemId: z.string().uuid() }).strict(),
    auditExempt: 'The structure service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await removeStructureItem(actor, params.itemId);
    return { data: { ok: true } };
  },
);
