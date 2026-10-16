// path: app/(public)/tools/sales-tax-calculator/page.tsx
import type { Metadata } from 'next';
import { JsonLd } from '@/components/marketing/json-ld';
import { LeadBox } from '@/components/marketing/tools/lead-box';
import { SalesTaxCalculator } from '@/components/marketing/tools/calculators';
import { SITE_NAME } from '@/config/seo';
import { siteUrl } from '@/lib/cms/site-url';
import { t } from '@/lib/i18n';
import { breadcrumbs } from '@/lib/seo/jsonld';

export const metadata: Metadata = {
  title: t('s06Public.tools.tax.title'),
  description: t('s06Public.tools.tax.description'),
  alternates: { canonical: '/tools/sales-tax-calculator' },
};

export default function Page(): JSX.Element {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-sp-24 px-sp-16 py-sp-48">
      <JsonLd
        data={breadcrumbs(siteUrl(), [
          { name: SITE_NAME, path: '/' },
          { name: t('s06Public.tools.title'), path: '/tools' },
          { name: t('s06Public.tools.tax.title'), path: '/tools/sales-tax-calculator' },
        ])}
      />
      <header className="max-w-3xl space-y-2">
        <h1 className="text-h1 font-bold tracking-tight">{t('s06Public.tools.tax.title')}</h1>
        <p className="text-lead text-muted-foreground">{t('s06Public.tools.tax.description')}</p>
      </header>
      <SalesTaxCalculator />
      <div className="no-print max-w-2xl">
        <LeadBox source="calculator" />
      </div>
    </div>
  );
}
