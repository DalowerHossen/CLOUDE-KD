// path: app/api/whatsapp/rules/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { ruleInput } from '@/lib/whatsapp/automation-rules';
import { createRule, listRules } from '@/services/whatsapp/rules';

export const GET = withApi(
  {
    id: 'whatsapp.rules.list',
    scope: 'tenant',
    permission: { action: 'whatsapp.read', resourceType: 'whatsapp_rule' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listRules(actor.companyId) };
  },
);

/** A new rule starts as a dry run and off, unless the body says otherwise. */
export const POST = withApi(
  {
    id: 'whatsapp.rules.create',
    scope: 'tenant',
    permission: { action: 'whatsapp.manage', resourceType: 'whatsapp_rule' },
    body: ruleInput,
    idempotent: true,
    auditExempt: 'The rule service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await createRule(actor, body) };
  },
);
