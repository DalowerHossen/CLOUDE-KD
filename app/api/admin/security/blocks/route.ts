// path: app/api/admin/security/blocks/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { addBlock, blockSchema, removeBlock, unblockSchema } from '@/services/security/admin-ops';

export const POST = withApi(
  {
    id: 'admin.security.blocks.add',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'security.manage', resourceType: 'ip_block' },
    body: blockSchema,
    auditExempt: 'The service writes the audit entry.',
  },
  async ({ body, actor }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: { ipHash: await addBlock(actor, body) } };
  },
);

export const DELETE = withApi(
  {
    id: 'admin.security.blocks.remove',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'security.manage', resourceType: 'ip_block' },
    query: unblockSchema,
    auditExempt: 'The service writes the audit entry.',
  },
  async ({ query }) => {
    await removeBlock(query.ipHash);
    return { data: { removed: true } };
  },
);
