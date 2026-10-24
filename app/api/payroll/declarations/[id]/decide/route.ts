// path: app/api/payroll/declarations/[id]/decide/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { decideDeclarationInput } from '@/services/payroll/portal-rules';
import { decideDeclaration } from '@/services/payroll/portal';

export const POST = withApi(
  {
    id: 'payroll.declarations.decide',
    scope: 'tenant',
    permission: { action: 'payroll.portal.manage', resourceType: 'employee' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: decideDeclarationInput,
    idempotent: true,
    stepUp: { maxAgeSeconds: 900 },
    auditExempt: 'The portal service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await decideDeclaration(actor, params.id, body) };
  },
);
