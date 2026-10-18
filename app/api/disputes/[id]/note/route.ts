// path: app/api/disputes/[id]/note/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { plain } from '@/lib/crm/clients';
import { ForbiddenError } from '@/lib/errors';
import { addNote } from '@/services/dispute/disputes';

const params = z.object({ id: z.string().uuid() }).strict();

export const POST = withApi(
  {
    id: 'disputes.note',
    scope: 'tenant',
    permission: { action: 'dispute.manage', resourceType: 'dispute' },
    params,
    body: z.strictObject({ title: plain(2, 200), content: plain(0, 5000) }),
    auditExempt: 'The evidence list and the case history record the note (append only).',
  },
  async ({ actor, params: p, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await addNote(actor, p.id, body) };
  },
);
