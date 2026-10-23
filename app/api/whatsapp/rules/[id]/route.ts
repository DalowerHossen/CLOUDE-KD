// path: app/api/whatsapp/rules/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { ruleUpdate } from '@/lib/whatsapp/automation-rules';
import { deleteRule, updateRule } from '@/services/whatsapp/rules';

const params = z.object({ id: z.string().uuid() }).strict();

export const PATCH = withApi(
  {
    id: 'whatsapp.rules.update',
    scope: 'tenant',
    permission: { action: 'whatsapp.manage', resourceType: 'whatsapp_rule' },
    params,
    body: ruleUpdate,
    auditExempt: 'The rule service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await updateRule(actor, p.id, body) };
  },
);

export const DELETE = withApi(
  {
    id: 'whatsapp.rules.remove',
    scope: 'tenant',
    permission: { action: 'whatsapp.manage', resourceType: 'whatsapp_rule' },
    params,
    auditExempt: 'The rule service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await deleteRule(actor, p.id);
    return { data: { ok: true } };
  },
);
