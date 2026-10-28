// path: app/api/admin/processors/onboarding/[id]/documents/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { documentInput } from '@/lib/payment/onboarding/rules';
import { uploadDocument } from '@/services/payment/onboarding';

const params = z.object({ id: z.string().uuid() }).strict();

export const POST = withApi(
  {
    id: 'admin.onboarding.document',
    scope: 'platform',
    roles: ['super_admin'],
    networkContext: 'admin',
    permission: { action: 'payment.processor.manage', resourceType: 'processor' },
    stepUp: { maxAgeSeconds: 300 },
    rateLimitPolicy: 'upload',
    maxBodyBytes: 10_485_760,
    params,
    body: documentInput,
    auditExempt: 'The onboarding service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await uploadDocument(actor, p.id, body) };
  },
);
