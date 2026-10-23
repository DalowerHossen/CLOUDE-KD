// path: app/api/accounting/accounts/seed/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { COUNTRY_TEMPLATES, INDUSTRIES } from '@/config/s15-accounting';
import { ensureChart } from '@/services/accounting/accounts';

export const POST = withApi(
  {
    id: 'accounting.accounts.seed',
    scope: 'tenant',
    permission: { action: 'accounting.account.manage', resourceType: 'account' },
    body: z.strictObject({
      industry: z.enum(INDUSTRIES as unknown as [string, ...string[]]).default('general'),
      template: z.enum(COUNTRY_TEMPLATES as unknown as [string, ...string[]]).default('generic'),
    }),
    auditExempt: 'The account service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return {
      data: await ensureChart(
        actor,
        body.industry as (typeof INDUSTRIES)[number],
        body.template as (typeof COUNTRY_TEMPLATES)[number],
      ),
    };
  },
);
