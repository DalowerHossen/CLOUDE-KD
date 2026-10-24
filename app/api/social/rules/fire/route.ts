// path: app/api/social/rules/fire/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { fireInput } from '@/lib/social/schedule';
import { fireTrigger } from '@/services/social/rules';

/** Starts the rules with this trigger key for one source (each source is handled once per rule). */
export const POST = withApi(
  {
    id: 'social.rules.fire',
    scope: 'tenant',
    permission: { action: 'social.post', resourceType: 'social_rule' },
    body: fireInput,
    idempotent: true,
    auditExempt: 'The rule service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await fireTrigger(actor, body) };
  },
);
