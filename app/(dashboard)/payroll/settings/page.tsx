// path: app/(dashboard)/payroll/settings/page.tsx
import type { Metadata } from 'next';
import { ActionButton } from '@/app/(dashboard)/wallet/_components/action-button';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { FREQUENCIES } from '@/services/payroll/payroll-rules';
import { getPayrollSettings, type PayrollSettings } from '@/services/payroll/structures';
import { listTaxRules, type TaxRuleView } from '@/services/payroll/tax-settings';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Payroll settings' };

export default async function PayrollSettingsPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission(
    'payroll.settings.manage',
    'tenant',
    'payroll_settings',
  );
  const companyId = actor.companyId as string;
  let data: { settings: PayrollSettings; rules: TaxRuleView[] } | null;
  try {
    const [settings, rules] = await Promise.all([
      getPayrollSettings(companyId),
      listTaxRules(companyId),
    ]);
    data = { settings, rules };
  } catch {
    data = null;
  }
  const done = t('s15Payroll.common.done');
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s15Payroll.settings.title')}
        description={t('s15Payroll.settings.description')}
      />
      {data === null ? (
        <ErrorState description={t('s15Payroll.common.loadError')} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('s15Payroll.settings.generalTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <JsonForm
                endpoint="/api/payroll/settings"
                method="PUT"
                fixed={data.settings.version === null ? {} : { version: data.settings.version }}
                emptyAsNull
                submitLabel={t('s15Payroll.common.save')}
                doneText={done}
                fields={[
                  {
                    name: 'payFrequency',
                    label: t('s15Payroll.settings.payFrequency'),
                    kind: 'select',
                    initial: data.settings.payFrequency,
                    options: FREQUENCIES.map((f) => ({
                      value: f,
                      label: t(`s15Payroll.settings.frequencies.${f}` as StringKey),
                    })),
                  },
                  {
                    name: 'overtimeMultiplier',
                    label: t('s15Payroll.settings.overtimeMultiplier'),
                    initial: data.settings.overtimeMultiplier,
                    required: true,
                  },
                  {
                    name: 'overtimeCapHours',
                    label: t('s15Payroll.settings.overtimeCap'),
                    initial: data.settings.overtimeCapHours ?? '',
                  },
                  {
                    name: 'standardHoursPerMonth',
                    label: t('s15Payroll.settings.standardHours'),
                    initial: data.settings.standardHoursPerMonth,
                    required: true,
                  },
                  {
                    name: 'rounding',
                    label: t('s15Payroll.settings.rounding'),
                    kind: 'select',
                    initial: data.settings.rounding,
                    options: (['none', 'cent', 'dollar'] as const).map((r) => ({
                      value: r,
                      label: t(`s15Payroll.settings.roundings.${r}` as StringKey),
                    })),
                  },
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('s15Payroll.settings.taxTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              <p className="text-sm text-muted-foreground">{t('s15Payroll.settings.taxHelp')}</p>
              {data.rules.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('s15Payroll.settings.taxEmpty')}</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {data.rules.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{r.code}</span> {r.name}
                      <Badge variant="outline">
                        {t(`s15Payroll.settings.kinds.${r.kind}` as StringKey)}
                      </Badge>
                      <span className="text-muted-foreground">
                        {r.method === 'flat'
                          ? `${r.rate}%`
                          : `${r.brackets.length} ${t('s15Payroll.settings.bracketsShown')}`}
                        {r.wageCapAnnual ? `, cap ${r.wageCapAnnual}` : ''}
                      </span>
                      {r.status === 'inactive' ? (
                        <Badge variant="outline">{t('s15Payroll.settings.inactive')}</Badge>
                      ) : null}
                      <ActionButton
                        endpoint={`/api/payroll/tax-rules/${r.id}`}
                        method="PATCH"
                        body={{
                          version: r.version,
                          status: r.status === 'active' ? 'inactive' : 'active',
                        }}
                        label={
                          r.status === 'active'
                            ? t('s15Payroll.common.deactivate')
                            : t('s15Payroll.common.activate')
                        }
                        doneText={done}
                      />
                      <ActionButton
                        endpoint={`/api/payroll/tax-rules/${r.id}`}
                        method="DELETE"
                        label={t('s15Payroll.common.remove')}
                        doneText={done}
                      />
                    </li>
                  ))}
                </ul>
              )}
              <h3 className="font-semibold">{t('s15Payroll.settings.taxAdd')}</h3>
              <JsonForm
                endpoint="/api/payroll/tax-rules"
                resetAfter
                submitLabel={t('s15Payroll.settings.taxAdd')}
                doneText={done}
                fields={[
                  { name: 'code', label: t('s15Payroll.settings.code'), required: true },
                  { name: 'name', label: t('s15Payroll.settings.name'), required: true },
                  {
                    name: 'kind',
                    label: t('s15Payroll.settings.kind'),
                    kind: 'select',
                    initial: 'income_tax',
                    options: (
                      ['income_tax', 'employee_contribution', 'employer_contribution'] as const
                    ).map((k) => ({
                      value: k,
                      label: t(`s15Payroll.settings.kinds.${k}` as StringKey),
                    })),
                  },
                  {
                    name: 'method',
                    label: t('s15Payroll.settings.method'),
                    kind: 'select',
                    initial: 'flat',
                    options: (['flat', 'bracket'] as const).map((k) => ({
                      value: k,
                      label: t(`s15Payroll.settings.methods.${k}` as StringKey),
                    })),
                  },
                  { name: 'rate', label: t('s15Payroll.settings.rate'), initial: '0' },
                  {
                    name: 'appliesTo',
                    label: t('s15Payroll.settings.appliesTo'),
                    kind: 'select',
                    initial: 'taxable',
                    options: (['taxable', 'gross'] as const).map((k) => ({
                      value: k,
                      label: t(`s15Payroll.settings.appliesToOptions.${k}` as StringKey),
                    })),
                  },
                  { name: 'wageCapAnnual', label: t('s15Payroll.settings.wageCap') },
                  { name: 'extraThresholdAnnual', label: t('s15Payroll.settings.extraThreshold') },
                  { name: 'extraRate', label: t('s15Payroll.settings.extraRate'), initial: '0' },
                  {
                    name: 'exemptionAnnual',
                    label: t('s15Payroll.settings.exemption'),
                    initial: '0',
                  },
                  {
                    name: 'brackets',
                    label: t('s15Payroll.settings.brackets'),
                    hint: t('s15Payroll.settings.bracketsExample'),
                  },
                ]}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
