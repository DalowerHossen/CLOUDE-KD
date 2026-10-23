// path: app/(dashboard)/invoices/batches/new/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { BatchCreateForm } from '@/components/invoice/batch-create-form';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/state-views';
import { NotFoundError } from '@/lib/errors';
import { t } from '@/lib/i18n';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';
import { requirePagePermission } from '@/services/base/page-guard';
import { getInvoice, inputOf } from '@/services/invoice/invoices';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Create invoices for many clients' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewBatchPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('invoice.create', 'tenant', 'invoice');
  const from = (await searchParams).from ?? '';
  const header = (
    <PageHeader
      title={t('s09Batches.create.title')}
      description={t('s09Batches.create.description')}
      actions={
        <Link className="underline" href="/invoices/batches">
          {t('s09Batches.backToBatches')}
        </Link>
      }
    />
  );
  if (!UUID.test(from))
    return (
      <div className="space-y-sp-16">
        {header}
        <EmptyState title={t('s09Batches.create.needSource')} />
      </div>
    );
  let source: Awaited<ReturnType<typeof getInvoice>> | null = null;
  try {
    source = await getInvoice(actor.companyId as string, from);
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error;
  }
  if (source === null)
    return (
      <div className="space-y-sp-16">
        {header}
        <EmptyState title={t('s09Batches.create.needSource')} />
      </div>
    );
  return (
    <div className="mx-auto max-w-3xl space-y-sp-16">
      {header}
      <BatchCreateForm
        template={{ ...inputOf(source), kind: 'invoice' }}
        summary={t('s09Recurring.form.templateLines', {
          count: String(source.lines.length),
          total: formatMoney(Money.parse(source.totals.total)),
        })}
        isOwner={actor.role === 'owner'}
      />
    </div>
  );
}
