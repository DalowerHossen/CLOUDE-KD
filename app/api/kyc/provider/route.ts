// path: app/api/kyc/provider/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { startProviderCheck } from '@/services/kyc/provider';
import { z } from 'zod';

/** Starts the online identity check and returns the secure page the owner goes to. */
export const POST = withApi(
  {
    id: 'kyc.provider.start',
    scope: 'tenant',
    permission: { action: 'kyc.submit', resourceType: 'kyc' },
    networkContext: 'kyc',
    rateLimitPolicy: 'strict',
    body: z.object({}).strict(),
    auditExempt: 'The KYC provider service writes the audit entry.',
  },
  async ({ actor }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await startProviderCheck(actor) };
  },
);
