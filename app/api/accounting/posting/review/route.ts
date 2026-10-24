// path: app/api/accounting/posting/review/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { markReviewed } from '@/services/accounting/posting';

export const POST = withApi(
  {
    id: 'accounting.posting.review',
    scope: 'tenant',
    permission: { action: 'accounting.journal.post', resourceType: 'posting_log' },
    body: z.strictObject({ ids: z.array(z.string().uuid()).min(1).max(200) }),
    auditExempt: 'The posting service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: { reviewed: await markReviewed(actor, body.ids) } };
  },
);
