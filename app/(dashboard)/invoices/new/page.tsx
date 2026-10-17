// path: app/(dashboard)/invoices/new/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { InvoiceForm } from '@/components/invoice/invoice-form';
import { PageHeader } from '@/components/shared/page-header';
import { t } from '@/lib/i18n';
import { INVOICE_KINDS } from '@/lib/invoice/input';
import { requirePagePermission } from '@/services/base/page-guard';
import { loadFormData } from '@/services/invoice/form-data';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'New invoice' };

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('invoice.create', 'tenant', 'invoice');
  const today = new Date().toISOString().slice(0, 10);
  const data = await loadFormData(actor.companyId as string, today);
  const wanted = (await searchParams).kind;
  const kind = INVOICE_KINDS.find((k) => k === wanted) ?? 'invoice';
  return (
    <div className="mx-auto max-w-5xl space-y-sp-16">
      <PageHeader
        title={t('s09Invoicing.invoices.createTitle')}
        actions={
          <Link className="underline" href="/invoices">
            {t('s09Invoicing.invoices.back')}
          </Link>
        }
      />
      <InvoiceForm
        invoice={null}
        initial={{ ...data.blank, kind }}
        rates={data.rates}
        fxRates={data.fxRates}
        defaultTaxCodes={data.defaultTaxCodes}
        clientName=""
      />
    </div>
  );
}
