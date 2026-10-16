// path: app/api/security/device/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { currentActor } from '@/services/auth/actor';
import { onDeviceSeen } from '@/services/fraud/signals';

const body = z.object({ fingerprint: z.string().regex(/^[0-9a-f]{64}$/) }).strict();

export const POST = withApi(
  {
    id: 'security.device',
    scope: 'public',
    body,
    auditExempt: 'Device signals are stored in device_fingerprints and fraud_signals.',
  },
  async ({ body: input }) => {
    // Public scope (visitors may call it); only a signed-in user produces a record.
    const actor = await currentActor();
    if (!actor) throw new ForbiddenError();
    const raised = await onDeviceSeen(actor.userId, actor.companyId, input.fingerprint);
    return { data: { recorded: true, signals: raised.length } };
  },
);
