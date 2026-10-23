// path: app/api/public/v1/clients/[id]/route.ts
import { withPublicApi } from '@/lib/integrations/public-api';
import { clientUpdate, idParams } from '@/lib/integrations/public-schemas';
import { getResource, requireSandbox, updateSandboxChecked } from '@/services/publicapi/resources';

export const GET = withPublicApi(
  { id: 'public.clients.get', resource: 'clients', params: idParams },
  async ({ params, companyId, mode }) => ({
    data: await getResource({ companyId, mode }, 'clients', params.id),
  }),
);

/** Sandbox keys only until the clients service offers a write operation (request R1). */
export const PATCH = withPublicApi(
  { id: 'public.clients.update', resource: 'clients', params: idParams, body: clientUpdate },
  async ({ params, body, companyId, mode }) => {
    requireSandbox(mode);
    const updated = await updateSandboxChecked({ companyId, mode }, 'clients', params.id, body);
    return {
      data: updated,
      audit: {
        action: 'public_api.client_changed',
        resourceType: 'sandbox_client',
        resourceId: params.id,
        metadata: { fields: Object.keys(body).filter((k) => k !== 'version') },
      },
    };
  },
);
