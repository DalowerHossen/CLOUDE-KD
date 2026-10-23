// path: app/api/social/rules/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { ruleInput } from '@/lib/social/schedule';
import { createRule, listRules } from '@/services/social/rules';

export const GET = withApi(
  {
    id: 'social.rules.list',
    scope: 'tenant',
    permission: { action: 'social.read', resourceType: 'social_rule' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listRules(actor.companyId) };
  },
);

/** A new rule is off and is a dry run. */
export const POST = withApi(
  {
    id: 'social.rules.create',
    scope: 'tenant',
    permission: { action: 'social.post', resourceType: 'social_rule' },
    body: ruleInput,
    idempotent: true,
    auditExempt: 'The service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await createRule(actor, body) };
  },
);
