// path: app/api/whatsapp/account/health/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { checkHealth } from '@/services/whatsapp/accounts';

/** Asks WhatsApp whether the token, the account id and the phone number id belong together. */
export const POST = withApi(
  {
    id: 'whatsapp.account.health',
    scope: 'tenant',
    permission: { action: 'whatsapp.manage', resourceType: 'whatsapp_account' },
    body: z.object({}).strict(),
    rateLimitPolicy: 'strict',
    auditExempt: 'The account service writes the audit entry.',
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await checkHealth(actor) };
  },
);
