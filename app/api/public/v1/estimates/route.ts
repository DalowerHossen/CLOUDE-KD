// path: app/api/public/v1/estimates/route.ts
import { withPublicApi } from '@/lib/integrations/public-api';
import { estimateCreate, estimatesQuery } from '@/lib/integrations/public-schemas';
import {
  createEstimateSandbox,
  listResource,
  requireSandbox,
} from '@/services/publicapi/resources';

export const GET = withPublicApi(
  { id: 'public.estimates.list', resource: 'estimates', query: estimatesQuery },
  async ({ query, companyId, mode }) => {
    const page = await listResource({ companyId, mode }, 'estimates', query);
    return { data: page.items, nextCursor: page.nextCursor };
  },
);

/** Sandbox keys only until the estimates service offers a write operation (request R1). */
export const POST = withPublicApi(
  { id: 'public.estimates.create', resource: 'estimates', body: estimateCreate, idempotent: true },
  async ({ body, companyId, mode }) => {
    requireSandbox(mode);
    const created = await createEstimateSandbox({ companyId, mode }, body);
    return {
      status: 201,
      data: created,
      audit: {
        action: 'public_api.estimate_created',
        resourceType: 'sandbox_estimate',
        resourceId: String(created.id),
      },
    };
  },
);
