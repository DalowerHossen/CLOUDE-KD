// path: app/api/integrations/messaging/clients/[id]/prefs/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { prefsInput } from '@/lib/messaging/rules';
import { getPrefs, savePrefs } from '@/services/messaging/preferences';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'messaging.prefs.get',
    scope: 'tenant',
    permission: { action: 'integrations.messaging.read', resourceType: 'messaging_client_prefs' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getPrefs(actor.companyId, p.id) };
  },
);

/** The channel a client likes best and the channels the client does not want. */
export const PUT = withApi(
  {
    id: 'messaging.prefs.save',
    scope: 'tenant',
    permission: { action: 'integrations.messaging.manage', resourceType: 'messaging_client_prefs' },
    params,
    body: prefsInput,
    auditExempt: 'The messaging service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await savePrefs(actor, p.id, body) };
  },
);
