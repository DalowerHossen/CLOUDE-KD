// path: app/api/integrations/gateway/sub-merchants/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { subMerchantInput } from '@/lib/gateway/rules';
import { createSubMerchant, listSubMerchants } from '@/services/gateway/sub-merchants';

export const GET = withApi(
  {
    id: 'gateway.subMerchants.list',
    scope: 'tenant',
    permission: { action: 'gateway.read', resourceType: 'sub_merchant' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listSubMerchants(actor.companyId) };
  },
);

export const POST = withApi(
  {
    id: 'gateway.subMerchants.create',
    scope: 'tenant',
    permission: { action: 'gateway.manage', resourceType: 'sub_merchant' },
    body: subMerchantInput,
    auditExempt: 'The sub-merchant service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await createSubMerchant(actor, body) };
  },
);
