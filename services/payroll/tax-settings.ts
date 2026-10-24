// path: services/payroll/tax-settings.ts
// Payroll tax settings: the income tax and contribution rules the owner configures (flat or bracket). The platform ships no
// rates for any country; a rule is the owner's (or the accountant's) statement of what applies. Employer contributions are costs of
// the company and do not reduce net pay.
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { toInt } from '@/lib/reports/numbers';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { Money } from '@/lib/utils/currency';
import type { Actor } from '@/types/contracts';
import { mapAccountingError } from '@/services/accounting/db-errors';
import { taxRuleInput } from './payroll-rules';
import type { TaxRule } from './tax-calc-rules';

export interface TaxRuleView extends TaxRule {
  id: string;
  status: 'active' | 'inactive';
  version: number;
}

const RC =
  'id, code, name, kind, method, rate, applies_to, wage_cap_annual, extra_threshold_annual, extra_rate, exemption_annual, status, sort_order, version';
const m = (v: string | number): string => Money.parseRounded(String(v)).toDbString();
const mn = (v: string | number | null): string | null => (v === null ? null : m(v));

export async function listTaxRules(companyId: string, activeOnly = false): Promise<TaxRuleView[]> {
  const admin = getAdminSupabase();
  let q = admin
    .from('payroll_tax_rules')
    .select(RC)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('sort_order')
    .order('code')
    .limit(200);
  if (activeOnly) q = q.eq('status', 'active');
  const [rules, brackets] = await Promise.all([
    q,
    admin
      .from('payroll_tax_brackets')
      .select('rule_id, lower_annual, rate')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('lower_annual')
      .limit(5000),
  ]);
  if (rules.error) throw new InternalError(rules.error);
  if (brackets.error) throw new InternalError(brackets.error);
  return (rules.data ?? []).map((r) => ({
    id: String(r.id),
    code: String(r.code),
    name: String(r.name),
    kind:
      r.kind === 'employer_contribution'
        ? 'employer_contribution'
        : r.kind === 'employee_contribution'
          ? 'employee_contribution'
          : 'income_tax',
    method: r.method === 'bracket' ? 'bracket' : 'flat',
    rate: m(r.rate as string | number),
    appliesTo: r.applies_to === 'gross' ? 'gross' : 'taxable',
    wageCapAnnual: mn(r.wage_cap_annual as string | number | null),
    extraThresholdAnnual: mn(r.extra_threshold_annual as string | number | null),
    extraRate: m(r.extra_rate as string | number),
    exemptionAnnual: m(r.exemption_annual as string | number),
    brackets: (brackets.data ?? [])
      .filter((b) => String(b.rule_id) === String(r.id))
      .map((b) => ({
        lowerAnnual: m(b.lower_annual as string | number),
        rate: m(b.rate as string | number),
      })),
    status: r.status === 'inactive' ? 'inactive' : 'active',
    version: toInt(r.version),
  }));
}

async function writeBrackets(
  companyId: string,
  ruleId: string,
  brackets: readonly { lowerAnnual: string; rate: string }[],
): Promise<void> {
  const admin = getAdminSupabase();
  const del = await admin
    .from('payroll_tax_brackets')
    .update({ deleted_at: new Date().toISOString() })
    .eq('rule_id', ruleId)
    .is('deleted_at', null);
  if (del.error) mapAccountingError(del.error);
  if (brackets.length === 0) return;
  const ins = await admin.from('payroll_tax_brackets').insert(
    brackets.map((b) => ({
      company_id: companyId,
      rule_id: ruleId,
      lower_annual: b.lowerAnnual,
      rate: b.rate,
    })),
  );
  if (ins.error) mapAccountingError(ins.error);
}

export async function createTaxRule(actor: Actor, input: unknown): Promise<TaxRuleView> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const parsed = taxRuleInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The tax rule is not valid.');
  const d = parsed.data;
  const { data, error } = await getAdminSupabase()
    .from('payroll_tax_rules')
    .insert({
      company_id: companyId,
      code: d.code,
      name: d.name,
      kind: d.kind,
      method: d.method,
      rate: d.rate,
      applies_to: d.appliesTo,
      wage_cap_annual: d.wageCapAnnual,
      extra_threshold_annual: d.extraThresholdAnnual,
      extra_rate: d.extraRate,
      exemption_annual: d.exemptionAnnual,
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') throw new ConflictError('A rule with this code exists.');
    mapAccountingError(error);
  }
  const id = String((data as { id: string }).id);
  await writeBrackets(companyId, id, d.brackets);
  await getService('audit').record({
    action: 'payroll.tax_rule_created',
    resourceType: 'payroll_tax_rule',
    resourceId: id,
    companyId,
    metadata: { code: d.code, method: d.method },
  });
  return (await listTaxRules(companyId)).find((r) => r.id === id) as TaxRuleView;
}

export async function setTaxRuleStatus(
  actor: Actor,
  id: string,
  version: number,
  status: 'active' | 'inactive',
): Promise<TaxRuleView> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const { data, error } = await getAdminSupabase()
    .from('payroll_tax_rules')
    .update({ status })
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('version', version)
    .is('deleted_at', null)
    .select('id');
  if (error) mapAccountingError(error);
  if ((data ?? []).length === 0) throw new ConflictError('The rule changed. Reload and try again.');
  await getService('audit').record({
    action: 'payroll.tax_rule_status',
    resourceType: 'payroll_tax_rule',
    resourceId: id,
    companyId,
    metadata: { status },
  });
  return (await listTaxRules(companyId)).find((r) => r.id === id) as TaxRuleView;
}

export async function removeTaxRule(actor: Actor, id: string): Promise<void> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const admin = getAdminSupabase();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('payroll_tax_rules')
    .update({ deleted_at: now })
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .select('id');
  if (error) mapAccountingError(error);
  if ((data ?? []).length === 0) throw new NotFoundError();
  const b = await admin
    .from('payroll_tax_brackets')
    .update({ deleted_at: now })
    .eq('rule_id', id)
    .is('deleted_at', null);
  if (b.error) mapAccountingError(b.error);
  await getService('audit').record({
    action: 'payroll.tax_rule_removed',
    resourceType: 'payroll_tax_rule',
    resourceId: id,
    companyId,
    metadata: {},
  });
}
