// path: app/api/payroll/tax-rules/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { taxRuleInput } from '@/services/payroll/payroll-rules';
import { createTaxRule, listTaxRules } from '@/services/payroll/tax-settings';

export const GET = withApi(
  {
    id: 'payroll.tax_rules.list',
    scope: 'tenant',
    permission: { action: 'payroll.settings.manage', resourceType: 'payroll_tax_rule' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listTaxRules(actor.companyId) };
  },
);

export const POST = withApi(
  {
    id: 'payroll.tax_rules.create',
    scope: 'tenant',
    permission: { action: 'payroll.settings.manage', resourceType: 'payroll_tax_rule' },
    body: taxRuleInput,
    auditExempt: 'The tax settings service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await createTaxRule(actor, body) };
  },
);
