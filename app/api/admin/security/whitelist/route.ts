// path: app/api/admin/security/whitelist/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import {
  addWhitelist,
  idSchema,
  removeWhitelist,
  whitelistSchema,
} from '@/services/security/admin-ops';

export const POST = withApi(
  {
    id: 'admin.security.whitelist.add',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'security.manage', resourceType: 'ip_whitelist' },
    stepUp: { maxAgeSeconds: 300 },
    body: whitelistSchema,
    auditExempt: 'The service writes the audit entry.',
  },
  async ({ body, actor }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: { id: await addWhitelist(actor, body) } };
  },
);

export const DELETE = withApi(
  {
    id: 'admin.security.whitelist.remove',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'security.manage', resourceType: 'ip_whitelist' },
    stepUp: { maxAgeSeconds: 300 },
    query: idSchema,
    auditExempt: 'The service writes the audit entry.',
  },
  async ({ query }) => {
    await removeWhitelist(query.id);
    return { data: { removed: true } };
  },
);
