// path: app/api/admin/processors/routing/[ruleId]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { routingRuleDeleteSchema, routingRuleUpdateSchema } from '@/schemas/payment/routing';
import { deleteRoutingRule, updateRoutingRule } from '@/services/payment/routing';

const params = z.object({ ruleId: z.string().uuid() }).strict();

export const PUT = withApi(
  {
    id: 'admin.routing.update',
    scope: 'platform',
    roles: ['super_admin'],
    networkContext: 'admin',
    permission: { action: 'payment.processor.manage', resourceType: 'routing_rule' },
    stepUp: { maxAgeSeconds: 300 },
    rateLimitPolicy: 'strict',
    params,
    body: routingRuleUpdateSchema,
    auditExempt: 'The routing service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await updateRoutingRule(actor, p.ruleId, body) };
  },
);

export const DELETE = withApi(
  {
    id: 'admin.routing.delete',
    scope: 'platform',
    roles: ['super_admin'],
    networkContext: 'admin',
    permission: { action: 'payment.processor.manage', resourceType: 'routing_rule' },
    stepUp: { maxAgeSeconds: 300 },
    rateLimitPolicy: 'strict',
    params,
    body: routingRuleDeleteSchema,
    auditExempt: 'The routing service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    await deleteRoutingRule(actor, p.ruleId, body.expectedVersion);
    return { data: { removed: true } };
  },
);
