// path: app/api/integrations/gateway/sub-merchants/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { subMerchantUpdate } from '@/lib/gateway/rules';
import { getSubMerchant, updateSubMerchant } from '@/services/gateway/sub-merchants';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'gateway.subMerchants.get',
    scope: 'tenant',
    permission: { action: 'gateway.read', resourceType: 'sub_merchant' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getSubMerchant(actor.companyId, p.id) };
  },
);

export const PATCH = withApi(
  {
    id: 'gateway.subMerchants.update',
    scope: 'tenant',
    permission: { action: 'gateway.manage', resourceType: 'sub_merchant' },
    params,
    body: subMerchantUpdate,
    auditExempt: 'The sub-merchant service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await updateSubMerchant(actor, p.id, body) };
  },
);
