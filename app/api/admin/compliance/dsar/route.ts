// path: app/api/admin/compliance/dsar/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { createDsar, dsarCreateSchema } from '@/services/compliance/dsar';

export const POST = withApi(
  {
    id: 'admin.compliance.dsar.create',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'dsar.process', resourceType: 'dsar_request' },
    body: dsarCreateSchema,
    auditExempt: 'The DSAR service writes the audit entry.',
  },
  async ({ body, actor }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: { id: await createDsar(actor, body) } };
  },
);
