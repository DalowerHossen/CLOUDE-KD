// path: app/api/clients/duplicates/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { duplicateQuery } from '@/lib/crm/search';
import { findDuplicates } from '@/services/client/duplicates';

const permission = { action: 'client.read', resourceType: 'client' } as const;

/** Look-alikes of one name or e-mail (used by the form while typing). */
export const GET = withApi(
  { id: 'clients.duplicates', scope: 'tenant', permission, query: duplicateQuery },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await findDuplicates(actor.companyId, query) };
  },
);
