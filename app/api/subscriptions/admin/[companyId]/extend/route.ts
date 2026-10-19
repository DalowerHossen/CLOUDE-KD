// path: app/api/subscriptions/admin/[companyId]/extend/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { plain } from '@/lib/crm/clients';
import { ForbiddenError } from '@/lib/errors';
import { adminExtend } from '@/services/subscription/platform';

export const POST = withApi(
  {
    id: 'subscriptions.admin.extend',
    scope: 'platform',
    networkContext: 'admin',
    roles: ['super_admin'],
    permission: { action: 'subscription.admin', resourceType: 'subscription' },
    params: z.object({ companyId: z.string().uuid() }).strict(),
    body: z.strictObject({ days: z.number().int().min(1).max(90), note: plain(3, 300) }),
    auditExempt: 'The subscription service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await adminExtend(actor, params.companyId, body.days, body.note) };
  },
);
