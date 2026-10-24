// path: app/api/admin/processors/routing/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { routingRuleCreateSchema } from '@/schemas/payment/routing';
import { createRoutingRule, listRoutingRules } from '@/services/payment/routing';

export const GET = withApi(
  {
    id: 'admin.routing.list',
    scope: 'platform',
    roles: ['super_admin'],
    networkContext: 'admin',
    permission: { action: 'payment.processor.view', resourceType: 'routing_rule' },
  },
  async () => ({ data: await listRoutingRules() }),
);

export const POST = withApi(
  {
    id: 'admin.routing.create',
    scope: 'platform',
    roles: ['super_admin'],
    networkContext: 'admin',
    permission: { action: 'payment.processor.manage', resourceType: 'routing_rule' },
    stepUp: { maxAgeSeconds: 300 },
    rateLimitPolicy: 'strict',
    body: routingRuleCreateSchema,
    auditExempt: 'The routing service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await createRoutingRule(actor, body) };
  },
);
