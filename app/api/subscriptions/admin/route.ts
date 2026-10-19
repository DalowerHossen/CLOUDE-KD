// path: app/api/subscriptions/admin/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { listAllInvoices } from '@/services/subscription/invoices';
import { listSubscriptions } from '@/services/subscription/platform';

export const GET = withApi(
  {
    id: 'subscriptions.admin.list',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'subscription.admin', resourceType: 'subscription' },
    query: z.strictObject({
      plan: z
        .string()
        .regex(/^[a-z][a-z0-9_]{1,30}$/)
        .optional(),
      status: z.enum(['incomplete', 'trialing', 'active', 'past_due', 'grace', 'ended']).optional(),
    }),
  },
  async ({ actor, query }) => {
    if (!actor) throw new ForbiddenError();
    const [subscriptions, openInvoices] = await Promise.all([
      listSubscriptions(actor, query),
      listAllInvoices(actor, { status: 'open' }),
    ]);
    return { data: { subscriptions, openInvoices } };
  },
);
