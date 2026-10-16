// path: app/(dashboard)/invoices/tax/page.tsx
import type { Metadata } from 'next';
import { ClientSearch } from '@/components/invoice/client-search';
import { FxRatesPanel } from '@/components/invoice/fx-rates-panel';
import { TaxRatesManager } from '@/components/invoice/tax-rates-manager';
import { TaxSettingsForm } from '@/components/invoice/tax-settings-form';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { getService } from '@/lib/container';
import { t } from '@/lib/i18n';
import { TAX_TEMPLATES } from '@/lib/tax/templates';
import { requirePagePermission } from '@/services/base/page-guard';
import { latestRates } from '@/services/fx/rates';
import { listRates } from '@/services/tax/rates';
import { getTaxSettings } from '@/services/tax/settings';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Tax and rates' };

export default async function TaxPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('tax.read', 'tenant', 'tax_rate');
  const companyId = actor.companyId as string;
  const canManage = await getService('permissions').can(actor, 'tax.manage', { type: 'tax_rate' });
  const data = await Promise.all([
    listRates(companyId),
    getTaxSettings(companyId),
    latestRates(companyId),
  ]).catch(() => null);
  if (!data) return <ErrorState description={t('s09Invoicing.tax.error')} />;
  const [rates, settings, fx] = data;
  return (
    <div className="mx-auto max-w-4xl space-y-sp-24">
      <PageHeader
        title={t('s09Invoicing.tax.title')}
        description={t('s09Invoicing.tax.description')}
      />
      <TaxRatesManager rates={rates} templates={TAX_TEMPLATES} canManage={canManage} />
      <TaxSettingsForm settings={settings} canManage={canManage} />
      <FxRatesPanel
        rates={fx}
        today={new Date().toISOString().slice(0, 10)}
        canManage={canManage}
      />
      <section className="space-y-sp-8">
        <h2 className="text-lg font-semibold">{t('s09Invoicing.tax.exemptionsTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('s09Invoicing.tax.exemptionsHelp')}</p>
        <ClientSearch />
      </section>
    </div>
  );
}
