// path: app/api/credit-notes/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { getCreditNote, listApplications, trashCreditNote } from '@/services/credit/credit-notes';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'creditNotes.get',
    scope: 'tenant',
    permission: { action: 'credit.read', resourceType: 'credit_note' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    const [creditNote, applications] = await Promise.all([
      getCreditNote(actor.companyId, p.id),
      listApplications(actor.companyId, { sourceId: p.id }),
    ]);
    return { data: { creditNote, applications } };
  },
);

export const DELETE = withApi(
  {
    id: 'creditNotes.trash',
    scope: 'tenant',
    permission: { action: 'credit.create', resourceType: 'credit_note' },
    params,
    auditExempt: 'The credit service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor) throw new ForbiddenError();
    await trashCreditNote(actor, p.id);
    return { data: { id: p.id } };
  },
);
