// path: app/api/admin/processors/accounts/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { accountActionInput } from '@/lib/payment/company-accounts-rules';
import type { Actor } from '@/types/contracts';
import { removeAccount, setAccountStatus, testAccount } from '@/services/payment/company-accounts';

async function runAction(actor: Actor, id: string, action: string): Promise<unknown> {
  switch (action) {
    case 'test':
      return testAccount(actor, id);
    case 'enable':
      return setAccountStatus(actor, id, 'active');
    case 'disable':
      return setAccountStatus(actor, id, 'disabled');
    default:
      await removeAccount(actor, id);
      return { removed: true };
  }
}

const params = z.object({ id: z.string().uuid() }).strict();

export const POST = withApi(
  {
    id: 'admin.accounts.action',
    scope: 'platform',
    roles: ['super_admin'],
    networkContext: 'admin',
    permission: { action: 'payment.processor.manage', resourceType: 'processor' },
    stepUp: { maxAgeSeconds: 300 },
    rateLimitPolicy: 'strict',
    params,
    body: accountActionInput,
    auditExempt: 'The accounts service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await runAction(actor, p.id, body.action) };
  },
);
