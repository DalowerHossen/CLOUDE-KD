// path: app/api/accounting/posting/[id]/retry/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { retryPosting } from '@/services/accounting/posting';

export const POST = withApi(
  {
    id: 'accounting.posting.retry',
    scope: 'tenant',
    permission: { action: 'accounting.journal.post', resourceType: 'posting_log' },
    params: z.object({ id: z.string().uuid() }).strict(),
    idempotent: true,
    auditExempt: 'The journal entry made by the retry is audited by the database trigger.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await retryPosting(actor, params.id) };
  },
);
