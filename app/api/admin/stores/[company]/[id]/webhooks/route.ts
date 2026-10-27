// path: app/api/admin/stores/[company]/[id]/webhooks/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { COMMERCE_STEP_UP_SECONDS } from '@/config/s16-commerce';
import { ForbiddenError } from '@/lib/errors';
import { registerStoreWebhooksFor } from '@/services/integration/admin-stores';

export const POST = withApi(
  {
    id: 'admin.stores.webhooks',
    scope: 'platform',
    roles: ['super_admin'],
    networkContext: 'admin',
    permission: { action: 'commerce.admin', resourceType: 'integration' },
    params: z.object({ company: z.string().uuid(), id: z.string().uuid() }).strict(),
    body: z.object({}).strict(),
    stepUp: { maxAgeSeconds: COMMERCE_STEP_UP_SECONDS },
    auditExempt: 'The connection service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await registerStoreWebhooksFor(actor, params.company, params.id) };
  },
);
