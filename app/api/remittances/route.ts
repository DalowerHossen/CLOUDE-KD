// path: app/api/remittances/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError, ValidationError } from '@/lib/errors';
import { remittanceInputSchema } from '@/lib/procurement/bills';
import { createRemittance } from '@/services/purchase/remittances';

export const POST = withApi(
  {
    id: 'remittances.create',
    scope: 'tenant',
    permission: { action: 'remittance.write', resourceType: 'supplier_remittance' },
    body: remittanceInputSchema,
    idempotent: true,
    rateLimitPolicy: 'strict',
    auditExempt: 'The remittance service writes the audit entry.',
  },
  async ({ actor, body, idempotencyKey }) => {
    if (!actor) throw new ForbiddenError();
    if (!idempotencyKey) throw new ValidationError('A valid Idempotency-Key header is required.');
    return { status: 201, data: await createRemittance(actor, body, idempotencyKey) };
  },
);
