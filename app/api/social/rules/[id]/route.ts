// path: app/api/social/rules/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { SOCIAL_STEP_UP_SECONDS } from '@/config/s16-social';
import { ForbiddenError } from '@/lib/errors';
import { ruleUpdate } from '@/lib/social/schedule';
import { deleteRule, updateRule } from '@/services/social/rules';

const params = z.object({ id: z.string().uuid() }).strict();

export const PATCH = withApi(
  {
    id: 'social.rules.update',
    scope: 'tenant',
    permission: { action: 'social.post', resourceType: 'social_rule' },
    params,
    body: ruleUpdate,
    stepUp: { maxAgeSeconds: SOCIAL_STEP_UP_SECONDS },
    auditExempt: 'The service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await updateRule(actor, p.id, body) };
  },
);

export const DELETE = withApi(
  {
    id: 'social.rules.remove',
    scope: 'tenant',
    permission: { action: 'social.post', resourceType: 'social_rule' },
    params,
    auditExempt: 'The service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await deleteRule(actor, p.id);
    return { data: { ok: true } };
  },
);
