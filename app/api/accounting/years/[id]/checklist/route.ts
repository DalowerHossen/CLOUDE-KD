// path: app/api/accounting/years/[id]/checklist/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { yearChecklist } from '@/services/accounting/periods';

export const GET = withApi(
  {
    id: 'accounting.years.checklist',
    scope: 'tenant',
    permission: { action: 'accounting.read', resourceType: 'fiscal_year' },
    params: z.object({ id: z.string().uuid() }).strict(),
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await yearChecklist(actor.companyId, params.id) };
  },
);
