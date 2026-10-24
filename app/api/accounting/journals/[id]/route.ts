// path: app/api/accounting/journals/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { journalDraftInput } from '@/services/accounting/journal-rules';
import { deleteDraft, getJournal, updateDraft } from '@/services/accounting/journals';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'accounting.journals.get',
    scope: 'tenant',
    permission: { action: 'accounting.read', resourceType: 'journal_entry' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getJournal(actor.companyId, p.id) };
  },
);

export const PUT = withApi(
  {
    id: 'accounting.journals.update',
    scope: 'tenant',
    permission: { action: 'accounting.journal.create', resourceType: 'journal_entry' },
    params,
    body: z.strictObject({ version: z.number().int().min(1), entry: journalDraftInput }),
    auditExempt: 'The journal service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await updateDraft(actor, p.id, body.version, body.entry) };
  },
);

export const DELETE = withApi(
  {
    id: 'accounting.journals.delete',
    scope: 'tenant',
    permission: { action: 'accounting.journal.create', resourceType: 'journal_entry' },
    params,
    auditExempt: 'The journal service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await deleteDraft(actor, p.id);
    return { data: { deleted: true } };
  },
);
