// path: app/api/payroll/structures/[id]/items/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { structureItemInput } from '@/services/payroll/payroll-rules';
import { setStructureItem } from '@/services/payroll/structures';

export const POST = withApi(
  {
    id: 'payroll.structures.item_set',
    scope: 'tenant',
    permission: { action: 'payroll.settings.manage', resourceType: 'salary_structure' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: structureItemInput,
    auditExempt: 'The structure service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await setStructureItem(actor, params.id, body) };
  },
);
