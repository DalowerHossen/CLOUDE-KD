// path: app/api/admin/system/tenant-export/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { buildSupportBundle } from '@/services/platform/tenant-export';

const bodySchema = z
  .object({
    companyId: z.string().uuid(),
    reason: z
      .string()
      .trim()
      .min(10)
      .max(300)
      .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' }),
  })
  .strict();

export const POST = withApi(
  {
    id: 'admin.system.tenant-export',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'system.manage', resourceType: 'platform' },
    stepUp: { maxAgeSeconds: 300 },
    rateLimitPolicy: 'export',
    body: bodySchema,
    auditExempt: 'The service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await buildSupportBundle(actor, body.companyId, body.reason) };
  },
);
