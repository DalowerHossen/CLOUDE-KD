// path: app/api/admin/stores/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { COMMERCE_STEP_UP_SECONDS } from '@/config/s16-commerce';
import { ForbiddenError } from '@/lib/errors';
import { connectInput } from '@/lib/integrations/mapping-rules';
import { connectStoreFor, listAllStores } from '@/services/integration/admin-stores';
import { listCompanies } from '@/services/payment/onboarding';

export const GET = withApi(
  {
    id: 'admin.stores.list',
    scope: 'platform',
    roles: ['super_admin'],
    networkContext: 'admin',
    permission: { action: 'commerce.admin', resourceType: 'integration' },
  },
  async () => ({ data: { stores: await listAllStores(), companies: await listCompanies() } }),
);

/** Connects a store for a company. The credentials are sealed at once and never returned. */
export const POST = withApi(
  {
    id: 'admin.stores.connect',
    scope: 'platform',
    roles: ['super_admin'],
    networkContext: 'admin',
    permission: { action: 'commerce.admin', resourceType: 'integration' },
    stepUp: { maxAgeSeconds: COMMERCE_STEP_UP_SECONDS },
    body: z.object({ companyId: z.string().uuid(), store: connectInput }).strict(),
    auditExempt: 'The connection service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await connectStoreFor(actor, body.companyId, body.store) };
  },
);
