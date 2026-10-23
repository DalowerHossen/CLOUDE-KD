// path: app/api/accounting/journals/[id]/decide/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { decideJournal } from '@/services/accounting/journals';

export const POST = withApi(
  {
    id: 'accounting.journals.decide',
    scope: 'tenant',
    permission: { action: 'accounting.journal.post', resourceType: 'journal_entry' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.strictObject({
      decision: z.enum(['approve', 'reject']),
      reason: z
        .string()
        .trim()
        .max(300)
        .refine((v) => !/[<>]/.test(v))
        .default(''),
    }),
    auditExempt: 'The journal service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await decideJournal(actor, params.id, body.decision, body.reason) };
  },
);
