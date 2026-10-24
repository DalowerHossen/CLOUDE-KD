// path: app/api/integrations/commerce/conflicts/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { conflictResolution } from '@/lib/integrations/mapping-rules';
import { resolveConflict } from '@/services/integration/commerce-conflicts';

/** Closes a conflict as resolved or ignored; the order goes on when nothing else stops it. */
export const POST = withApi(
  {
    id: 'commerce.conflicts.resolve',
    scope: 'tenant',
    permission: { action: 'commerce.sync', resourceType: 'integration_conflict' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: conflictResolution,
    idempotent: true,
    auditExempt: 'The conflict service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await resolveConflict(actor, params.id, body) };
  },
);
