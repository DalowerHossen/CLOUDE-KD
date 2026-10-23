// path: app/api/companies/admin/actions/route.ts
import { withApi } from '@/lib/api/with-api';
import { peopleActionSchema } from '@/lib/company/admin-input';
import { getService } from '@/lib/container';
import { ForbiddenError } from '@/lib/errors';
import { runPeopleAction } from '@/services/company/admin';

// Notes need only people.note; the state-changing actions also need people.manage, checked here.
export const POST = withApi(
  {
    id: 'admin.people.action',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'people.note', resourceType: 'user' },
    stepUp: { maxAgeSeconds: 300 },
    body: peopleActionSchema,
    auditExempt: 'The service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    if (body.action !== 'note') {
      const allowed = await getService('permissions').can(actor, 'people.manage', {
        type: body.action.startsWith('tenant.') ? 'tenant' : 'user',
      });
      if (!allowed) throw new ForbiddenError();
    }
    return { data: await runPeopleAction(actor, body) };
  },
);
