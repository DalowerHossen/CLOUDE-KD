// path: app/api/public/v1/clients/route.ts
import { withPublicApi } from '@/lib/integrations/public-api';
import { clientCreate, clientsQuery } from '@/lib/integrations/public-schemas';
import { createClientSandbox, listResource, requireSandbox } from '@/services/publicapi/resources';

export const GET = withPublicApi(
  { id: 'public.clients.list', resource: 'clients', query: clientsQuery },
  async ({ query, companyId, mode }) => {
    const page = await listResource({ companyId, mode }, 'clients', query);
    return { data: page.items, nextCursor: page.nextCursor };
  },
);

/** Sandbox keys only until the clients service offers a write operation (request R1). */
export const POST = withPublicApi(
  { id: 'public.clients.create', resource: 'clients', body: clientCreate, idempotent: true },
  async ({ body, companyId, mode }) => {
    requireSandbox(mode);
    const created = await createClientSandbox({ companyId, mode }, body);
    return {
      status: 201,
      data: created,
      audit: {
        action: 'public_api.client_created',
        resourceType: 'sandbox_client',
        resourceId: String(created.id),
      },
    };
  },
);
