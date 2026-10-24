// path: app/api/payroll/tax-rules/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { removeTaxRule, setTaxRuleStatus } from '@/services/payroll/tax-settings';

const params = z.object({ id: z.string().uuid() }).strict();

export const PATCH = withApi(
  {
    id: 'payroll.tax_rules.status',
    scope: 'tenant',
    permission: { action: 'payroll.settings.manage', resourceType: 'payroll_tax_rule' },
    params,
    body: z.strictObject({
      version: z.number().int().min(1),
      status: z.enum(['active', 'inactive']),
    }),
    auditExempt: 'The tax settings service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await setTaxRuleStatus(actor, p.id, body.version, body.status) };
  },
);

export const DELETE = withApi(
  {
    id: 'payroll.tax_rules.remove',
    scope: 'tenant',
    permission: { action: 'payroll.settings.manage', resourceType: 'payroll_tax_rule' },
    params,
    auditExempt: 'The tax settings service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await removeTaxRule(actor, p.id);
    return { data: { ok: true } };
  },
);
