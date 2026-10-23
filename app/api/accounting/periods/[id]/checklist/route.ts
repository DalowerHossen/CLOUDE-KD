// path: app/api/accounting/periods/[id]/checklist/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { periodChecklist } from '@/services/accounting/periods';

export const GET = withApi(
  {
    id: 'accounting.periods.checklist',
    scope: 'tenant',
    permission: { action: 'accounting.read', resourceType: 'fiscal_period' },
    params: z.object({ id: z.string().uuid() }).strict(),
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await periodChecklist(actor.companyId, params.id) };
  },
);
