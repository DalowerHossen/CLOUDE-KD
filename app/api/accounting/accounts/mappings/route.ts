// path: app/api/accounting/accounts/mappings/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { MAPPING_KEYS } from '@/config/s15-accounting';
import { listMappings, setMapping } from '@/services/accounting/accounts';

export const GET = withApi(
  {
    id: 'accounting.mappings.list',
    scope: 'tenant',
    permission: { action: 'accounting.read', resourceType: 'account' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listMappings(actor.companyId) };
  },
);

export const PUT = withApi(
  {
    id: 'accounting.mappings.set',
    scope: 'tenant',
    permission: { action: 'accounting.account.manage', resourceType: 'account' },
    body: z.strictObject({
      key: z.enum(MAPPING_KEYS),
      accountId: z.string().uuid(),
    }),
    auditExempt: 'The account service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await setMapping(actor, body.key, body.accountId);
    return { data: await listMappings(actor.companyId) };
  },
);
