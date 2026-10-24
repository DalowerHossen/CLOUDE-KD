// path: app/api/accounting/audit-pack/route.ts
// The packs made so far (the file itself comes from the download route).
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { listPacks } from '@/services/accounting/audit-pack';

export const GET = withApi(
  {
    id: 'accounting.audit_pack.list',
    scope: 'tenant',
    permission: { action: 'accounting.audit.export', resourceType: 'audit_pack' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listPacks(actor.companyId) };
  },
);
