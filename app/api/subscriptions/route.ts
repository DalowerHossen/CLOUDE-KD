// path: app/api/subscriptions/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { entitlementsOf } from '@/services/entitlement/entitlement';
import { meters } from '@/services/entitlement/usage';
import { listInvoices } from '@/services/subscription/invoices';
import { getSubscription, subscriptionEvents } from '@/services/subscription/platform';

export const GET = withApi(
  {
    id: 'subscriptions.summary',
    scope: 'tenant',
    permission: { action: 'subscription.read', resourceType: 'subscription' },
    query: z.strictObject({}),
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    const [subscription, invoices, usage, plan, events] = await Promise.all([
      getSubscription(actor.companyId),
      listInvoices(actor.companyId),
      meters(actor.companyId),
      entitlementsOf(actor.companyId),
      subscriptionEvents(actor.companyId, 20),
    ]);
    return { data: { subscription, invoices, meters: usage, plan: plan.slug, events } };
  },
);
