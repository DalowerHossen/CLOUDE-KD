// path: app/api/accounting/journals/[id]/reverse/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { reverseJournal } from '@/services/accounting/journals';

export const POST = withApi(
  {
    id: 'accounting.journals.reverse',
    scope: 'tenant',
    permission: { action: 'accounting.journal.post', resourceType: 'journal_entry' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.strictObject({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      reason: z.string().trim().min(3).max(300),
    }),
    idempotent: true,
    auditExempt: 'The journal service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await reverseJournal(actor, params.id, body.date, body.reason) };
  },
);
