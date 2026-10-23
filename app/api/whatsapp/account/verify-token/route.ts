// path: app/api/whatsapp/account/verify-token/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { WHATSAPP_STEP_UP_SECONDS } from '@/config/s16-whatsapp';
import { ForbiddenError } from '@/lib/errors';
import { regenerateVerifyToken } from '@/services/whatsapp/accounts';

/** A new verify token for the Meta App Dashboard (in this answer only). */
export const POST = withApi(
  {
    id: 'whatsapp.account.verify_token',
    scope: 'tenant',
    permission: { action: 'whatsapp.manage', resourceType: 'whatsapp_account' },
    body: z.object({}).strict(),
    stepUp: { maxAgeSeconds: WHATSAPP_STEP_UP_SECONDS },
    auditExempt: 'The account service writes the audit entry.',
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await regenerateVerifyToken(actor) };
  },
);
