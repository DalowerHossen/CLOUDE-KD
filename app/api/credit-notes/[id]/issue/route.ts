// path: app/api/credit-notes/[id]/issue/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { creditIssueSchema } from '@/lib/credit/input';
import { issueCreditNote } from '@/services/credit/credit-notes';

export const POST = withApi(
  {
    id: 'creditNotes.issue',
    scope: 'tenant',
    permission: { action: 'credit.issue', resourceType: 'credit_note' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: creditIssueSchema,
    idempotent: true,
    rateLimitPolicy: 'strict',
    auditExempt: 'The credit service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await issueCreditNote(actor, p.id, body.autoApply) };
  },
);
