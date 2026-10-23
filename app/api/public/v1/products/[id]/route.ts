// path: app/api/public/v1/products/[id]/route.ts
import { withPublicApi } from '@/lib/integrations/public-api';
import { idParams, productUpdate } from '@/lib/integrations/public-schemas';
import { getResource, requireSandbox, updateSandboxChecked } from '@/services/publicapi/resources';

export const GET = withPublicApi(
  { id: 'public.products.get', resource: 'products', params: idParams },
  async ({ params, companyId, mode }) => ({
    data: await getResource({ companyId, mode }, 'products', params.id),
  }),
);

/** Sandbox keys only until the products service offers a write operation (request R1). */
export const PATCH = withPublicApi(
  { id: 'public.products.update', resource: 'products', params: idParams, body: productUpdate },
  async ({ params, body, companyId, mode }) => {
    requireSandbox(mode);
    const updated = await updateSandboxChecked({ companyId, mode }, 'products', params.id, body);
    return {
      data: updated,
      audit: {
        action: 'public_api.product_changed',
        resourceType: 'sandbox_product',
        resourceId: params.id,
        metadata: { fields: Object.keys(body).filter((k) => k !== 'version') },
      },
    };
  },
);
