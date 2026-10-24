// path: app/api/subscriptions/admin/[companyId]/plan/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { plain } from '@/lib/crm/clients';
import { ForbiddenError } from '@/lib/errors';
import { adminSetPlan } from '@/services/subscription/platform';

export const POST = withApi(
  {
    id: 'subscriptions.admin.plan',
    scope: 'platform',
    networkContext: 'admin',
    roles: ['super_admin'],
    permission: { action: 'subscription.admin', resourceType: 'subscription' },
    stepUp: { maxAgeSeconds: 600 },
    params: z.object({ companyId: z.string().uuid() }).strict(),
    body: z.strictObject({
      planSlug: z.string().regex(/^[a-z][a-z0-9_]{1,30}$/),
      note: plain(3, 300),
    }),
    auditExempt: 'The subscription service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor) throw new ForbiddenError();
    await adminSetPlan(actor, params.companyId, body.planSlug, body.note);
    return { data: { ok: true } };
  },
);
