// path: app/api/remittances/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { voidRemittance } from '@/services/purchase/remittances';

export const DELETE = withApi(
  {
    id: 'remittances.void',
    scope: 'tenant',
    permission: { action: 'remittance.write', resourceType: 'supplier_remittance' },
    params: z.object({ id: z.string().uuid() }).strict(),
    rateLimitPolicy: 'strict',
    auditExempt: 'The remittance service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor) throw new ForbiddenError();
    await voidRemittance(actor, p.id);
    return { data: { id: p.id, status: 'void' } };
  },
);
