// path: app/api/admin/processors/onboarding/[id]/note/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { noteInput } from '@/lib/payment/onboarding/rules';
import { addNote } from '@/services/payment/onboarding';

const params = z.object({ id: z.string().uuid() }).strict();

export const POST = withApi(
  {
    id: 'admin.onboarding.note',
    scope: 'platform',
    roles: ['super_admin'],
    networkContext: 'admin',
    permission: { action: 'payment.processor.manage', resourceType: 'processor' },
    stepUp: { maxAgeSeconds: 300 },
    rateLimitPolicy: 'strict',
    params,
    body: noteInput,
    auditExempt: 'The onboarding service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    await addNote(actor, p.id, body.note);
    return { data: { sent: true } };
  },
);
