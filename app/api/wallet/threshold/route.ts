// path: app/api/wallet/threshold/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { Money } from '@/lib/utils/currency';
import { setLowBalanceThreshold } from '@/services/wallet/wallet-service';

export const PUT = withApi(
  {
    id: 'wallet.threshold',
    scope: 'tenant',
    permission: { action: 'payout.method.manage', resourceType: 'wallet' },
    body: z.strictObject({
      threshold: z
        .string()
        .regex(/^\d{1,14}(\.\d{1,4})?$/, 'Enter an amount like 100 or 100.50.')
        .nullable(),
    }),
    auditExempt: 'The wallets table has the audit trigger.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await setLowBalanceThreshold(
      actor.companyId,
      body.threshold === null ? null : Money.parse(body.threshold),
    );
    return { data: { ok: true } };
  },
);
