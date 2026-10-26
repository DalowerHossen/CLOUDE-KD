// path: app/api/admin/system/kill-switches/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { killSwitchSchema } from '@/lib/platform/controls';
import { runKillSwitch } from '@/services/platform/controls';

const permission = { action: 'system.manage', resourceType: 'platform' } as const;

export const POST = withApi(
  {
    id: 'admin.system.kill-switches',
    scope: 'platform',
    networkContext: 'admin',
    permission,
    stepUp: { maxAgeSeconds: 300 },
    body: killSwitchSchema,
    auditExempt: 'The service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    await runKillSwitch(actor, body);
    return { data: { done: true } };
  },
);
