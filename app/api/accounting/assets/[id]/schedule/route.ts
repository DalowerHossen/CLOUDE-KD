// path: app/api/accounting/assets/[id]/schedule/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { scheduleOf } from '@/services/asset/assets';

export const GET = withApi(
  {
    id: 'accounting.assets.schedule',
    scope: 'tenant',
    permission: { action: 'accounting.read', resourceType: 'fixed_asset' },
    params: z.object({ id: z.string().uuid() }).strict(),
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await scheduleOf(actor.companyId, params.id) };
  },
);
