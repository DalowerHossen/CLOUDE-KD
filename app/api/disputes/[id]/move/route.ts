// path: app/api/disputes/[id]/move/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { plain } from '@/lib/crm/clients';
import { ForbiddenError } from '@/lib/errors';
import { moveDispute } from '@/services/dispute/disputes';
import { DISPUTE_STATUSES } from '@/services/dispute/status';

const params = z.object({ id: z.string().uuid() }).strict();

/** Moves a case through the workflow; a move the status machine does not allow is refused. */
export const POST = withApi(
  {
    id: 'disputes.move',
    scope: 'tenant',
    permission: { action: 'dispute.manage', resourceType: 'dispute' },
    params,
    body: z.strictObject({ to: z.enum(DISPUTE_STATUSES), note: plain(0, 1000) }),
    auditExempt: 'The dispute table has the audit trigger and the case history records the move.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await moveDispute(actor, p.id, body.to, body.note) };
  },
);
