// path: app/api/invoices/tax/exemptions/[clientId]/certificate/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { certificateUpload } from '@/lib/tax/input';
import { saveCertificate } from '@/services/tax/exemptions';

export const POST = withApi(
  {
    id: 'tax.exemptions.certificate',
    scope: 'tenant',
    permission: { action: 'tax.manage', resourceType: 'client' },
    params: z.object({ clientId: z.string().uuid() }).strict(),
    body: certificateUpload,
    rateLimitPolicy: 'upload',
    maxBodyBytes: 4_500_000,
    auditExempt: 'The tax service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await saveCertificate(actor, p.clientId, body) };
  },
);
