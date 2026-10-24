// path: app/(dashboard)/invoices/batches/[id]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BatchLive } from '@/components/invoice/batch-live';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { NotFoundError } from '@/lib/errors';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { getBatch } from '@/services/invoice/batch';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Batch' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function BatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('invoice.read', 'tenant', 'invoice_batch');
  const id = (await params).id;
  if (!UUID.test(id)) notFound();
  let data: Awaited<ReturnType<typeof getBatch>>;
  try {
    data = await getBatch(actor.companyId as string, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const { batch, items } = data;
  return (
    <div className="mx-auto max-w-4xl space-y-sp-16">
      <PageHeader
        title={t('s09Batches.detail.title', {
          action: t(`s09Batches.actions.${batch.action}` as StringKey),
        })}
        actions={
          <Link className="underline print:hidden" href="/invoices/batches">
            {t('s09Batches.backToBatches')}
          </Link>
        }
      />
      <div className="flex flex-wrap items-center gap-sp-12 text-sm">
        <Badge variant="outline">{t(`s09Batches.statuses.${batch.status}` as StringKey)}</Badge>
        <span>
          {t('s09Batches.detail.created')}: {batch.createdAt.slice(0, 16).replace('T', ' ')}
        </span>
        {batch.waiting ? (
          <span>
            {t('s09Batches.detail.scheduled', {
              time: batch.runAfter.slice(0, 16).replace('T', ' '),
            })}
          </span>
        ) : null}
      </div>
      <BatchLive
        id={batch.id}
        status={batch.status}
        counts={{
          total: batch.total,
          done: batch.done,
          failed: batch.failed,
          skipped: batch.skipped,
        }}
        canAct
      />
      <section className="space-y-sp-8">
        <h2 className="text-lg font-semibold">{t('s09Batches.detail.items')}</h2>
        <ul className="divide-y text-sm">
          {items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-sp-8 py-sp-4">
              <span>
                {i.invoiceId ? (
                  <Link className="underline" href={`/invoices/${i.invoiceId}`}>
                    {i.label || i.invoiceId}
                  </Link>
                ) : (
                  <span>{i.label}</span>
                )}
                {i.resultInvoiceId ? (
                  <>
                    {' - '}
                    <Link className="underline" href={`/invoices/${i.resultInvoiceId}`}>
                      {t('s09Batches.detail.open')}
                    </Link>
                  </>
                ) : null}
              </span>
              <span
                className={i.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}
              >
                {t(`s09Batches.itemStatuses.${i.status}` as StringKey)}
                {i.message ? ` - ${i.message}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
