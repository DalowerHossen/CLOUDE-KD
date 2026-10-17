// path: app/(dashboard)/estimates/new/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { InvoiceForm, type FormTarget } from '@/components/invoice/invoice-form';
import { PageHeader } from '@/components/shared/page-header';
import { t } from '@/lib/i18n';
import { addDays } from '@/lib/invoice/terms';
import { requirePagePermission } from '@/services/base/page-guard';
import { loadFormData } from '@/services/invoice/form-data';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'New estimate' };

const TARGET: FormTarget = {
  apiBase: '/api/estimates',
  pageBase: '/estimates',
  estimate: true,
};

export default async function NewEstimatePage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('estimate.create', 'tenant', 'estimate');
  const today = new Date().toISOString().slice(0, 10);
  const data = await loadFormData(actor.companyId as string, today);
  return (
    <div className="mx-auto max-w-5xl space-y-sp-16">
      <PageHeader
        title={t('s09Estimates.createTitle')}
        actions={
          <Link className="underline" href="/estimates">
            {t('s09Estimates.back')}
          </Link>
        }
      />
      <InvoiceForm
        invoice={null}
        target={TARGET}
        initial={{ ...data.blank, kind: 'invoice', dueDate: addDays(today, 30) }}
        rates={data.rates}
        fxRates={data.fxRates}
        defaultTaxCodes={data.defaultTaxCodes}
        clientName=""
      />
    </div>
  );
}
