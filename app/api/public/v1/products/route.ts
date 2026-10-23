// path: app/api/public/v1/products/route.ts
import { withPublicApi } from '@/lib/integrations/public-api';
import { productCreate, productsQuery } from '@/lib/integrations/public-schemas';
import { createProductSandbox, listResource, requireSandbox } from '@/services/publicapi/resources';

export const GET = withPublicApi(
  { id: 'public.products.list', resource: 'products', query: productsQuery },
  async ({ query, companyId, mode }) => {
    const page = await listResource({ companyId, mode }, 'products', query);
    return { data: page.items, nextCursor: page.nextCursor };
  },
);

/** Sandbox keys only until the products service offers a write operation (request R1). */
export const POST = withPublicApi(
  { id: 'public.products.create', resource: 'products', body: productCreate, idempotent: true },
  async ({ body, companyId, mode }) => {
    requireSandbox(mode);
    const created = await createProductSandbox({ companyId, mode }, body);
    return {
      status: 201,
      data: created,
      audit: {
        action: 'public_api.product_created',
        resourceType: 'sandbox_product',
        resourceId: String(created.id),
      },
    };
  },
);
