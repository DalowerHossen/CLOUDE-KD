// path: app/api/invoices/tax/exemptions/[clientId]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { exemptionSave } from '@/lib/tax/input';
import { getExemption, saveExemption } from '@/services/tax/exemptions';

const params = z.object({ clientId: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'tax.exemptions.get',
    scope: 'tenant',
    permission: { action: 'tax.read', resourceType: 'client' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getExemption(actor.companyId, p.clientId) };
  },
);

export const PUT = withApi(
  {
    id: 'tax.exemptions.save',
    scope: 'tenant',
    permission: { action: 'tax.manage', resourceType: 'client' },
    params,
    body: exemptionSave,
    auditExempt: 'The tax service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return {
      data: await saveExemption(actor, p.clientId, body.expectedVersion, body.exemption),
    };
  },
);
