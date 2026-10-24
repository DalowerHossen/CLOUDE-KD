// path: app/api/seo/audit/route.ts
import { withApi } from '@/lib/api/with-api';
import { runAudit } from '@/services/seo/audit';

export const GET = withApi(
  {
    id: 'seo.audit',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'seo.read', resourceType: 'seo' },
  },
  async () => ({ data: await runAudit() }),
);
