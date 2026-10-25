// path: app/api/kyc/business/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { saveBusiness } from '@/services/kyc/owner';
import { z } from 'zod';

/** Saves the answers to the questions about the business. The service checks them against the questions the platform asks. */
export const PUT = withApi(
  {
    id: 'kyc.business.save',
    scope: 'tenant',
    permission: { action: 'kyc.submit', resourceType: 'kyc' },
    networkContext: 'kyc',
    maxBodyBytes: 20_000,
    body: z.record(z.string().max(40), z.string().max(1000)),
    auditExempt: 'The KYC service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    await saveBusiness(actor, body);
    return { data: { done: true } };
  },
);
