// path: app/api/contracts/[id]/versions/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { listVersions } from '@/services/contract/contracts';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'contracts.versions',
    scope: 'tenant',
    permission: { action: 'contract.read', resourceType: 'contract' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listVersions(actor.companyId, p.id) };
  },
);
