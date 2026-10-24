// path: app/api/integrations/settlement/terms/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { SETTLEMENT_STEP_UP_SECONDS } from '@/config/s16-settlement';
import { ForbiddenError } from '@/lib/errors';
import { deleteTerms } from '@/services/gateway/terms';

const params = z.object({ id: z.string().uuid() }).strict();

export const DELETE = withApi(
  {
    id: 'settlement.terms.remove',
    scope: 'tenant',
    permission: { action: 'settlement.manage', resourceType: 'settlement_terms' },
    params,
    stepUp: { maxAgeSeconds: SETTLEMENT_STEP_UP_SECONDS },
    auditExempt: 'The terms service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor) throw new ForbiddenError();
    await deleteTerms(actor, p.id);
    return { data: { removed: true } };
  },
);
