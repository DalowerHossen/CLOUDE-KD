// path: app/api/accounting/journals/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { journalDraftInput } from '@/services/accounting/journal-rules';
import { createJournal, listJournals } from '@/services/accounting/journals';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const GET = withApi(
  {
    id: 'accounting.journals.list',
    scope: 'tenant',
    permission: { action: 'accounting.read', resourceType: 'journal_entry' },
    query: z.strictObject({
      from: day.optional(),
      to: day.optional(),
      status: z.enum(['draft', 'pending_approval', 'posted']).optional(),
      source: z.enum(['manual', 'system', 'import', 'reversal', 'recurring']).optional(),
      accountId: z.string().uuid().optional(),
      q: z.string().max(60).optional(),
      limit: z.coerce.number().int().min(1).max(200).optional(),
      offset: z.coerce.number().int().min(0).max(100_000).optional(),
    }),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listJournals(actor.companyId, query) };
  },
);

export const POST = withApi(
  {
    id: 'accounting.journals.create',
    scope: 'tenant',
    permission: { action: 'accounting.journal.create', resourceType: 'journal_entry' },
    body: z.strictObject({
      entry: journalDraftInput,
      mode: z.enum(['draft', 'post']).default('draft'),
      confirmDuplicate: z.boolean().default(false),
    }),
    idempotent: true,
    auditExempt: 'The journal service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return {
      status: 201,
      data: await createJournal(actor, body.entry, {
        mode: body.mode,
        confirmDuplicate: body.confirmDuplicate,
      }),
    };
  },
);
