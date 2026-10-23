// path: app/api/accounting/posting/rules/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { POSTING_RULES } from '@/services/accounting/posting-rules';

export const GET = withApi(
  {
    id: 'accounting.posting.rules',
    scope: 'tenant',
    permission: { action: 'accounting.read', resourceType: 'posting_log' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: POSTING_RULES };
  },
);
