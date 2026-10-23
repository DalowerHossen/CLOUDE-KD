// path: app/(dashboard)/estimates/[id]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EstimateActions } from '@/components/estimate/estimate-actions';
import { InvoiceForm, type FormTarget } from '@/components/invoice/invoice-form';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { getService } from '@/lib/container';
import { NotFoundError } from '@/lib/errors';
import { t, type StringKey } from '@/lib/i18n';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';
import { requirePagePermission } from '@/services/base/page-guard';
import { getEstimate, listEstimateEvents, type EstimateView } from '@/services/estimate/estimates';
import { loadFormData } from '@/services/invoice/form-data';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Estimate' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TARGET: FormTarget = { apiBase: '/api/estimates', pageBase: '/estimates', estimate: true };

export default async function EstimatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('estimate.read', 'tenant', 'estimate');
  const id = (await params).id;
  if (!UUID.test(id)) notFound();
  const companyId = actor.companyId as string;
  let estimate: EstimateView;
  try {
    estimate = await getEstimate(companyId, id, { includeTrashed: true });
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const perms = getService('permissions');
  const res = { type: 'estimate' } as const;
  const [canUpdate, canSend, canConvertRight, canDelete, data, events] = await Promise.all([
    perms.can(actor, 'estimate.update', res),
    perms.can(actor, 'estimate.send', res),
    perms.can(actor, 'estimate.convert', res),
    perms.can(actor, 'estimate.delete', res),
    loadFormData(companyId, new Date().toISOString().slice(0, 10)),
    listEstimateEvents(companyId, id),
  ]);
  const trashed = estimate.deletedAt !== null;
  const editable = estimate.status === 'draft' && !trashed && canUpdate;
  return (
    <div className="mx-auto max-w-5xl space-y-sp-16">
      <PageHeader
        title={
          estimate.number
            ? t('s09Estimates.detailTitle', { number: estimate.number })
            : t('s09Estimates.draftTitle')
        }
        actions={
          <Link className="underline print:hidden" href="/estimates">
            {t('s09Estimates.back')}
          </Link>
        }
      />
      <div className="flex flex-wrap items-center gap-sp-12 text-sm">
        <Badge variant="outline">
          {t(`s09Estimates.statuses.${estimate.status}` as StringKey)}
        </Badge>
        <span>
          {t('s09Estimates.validUntil')}: {estimate.validUntil}
        </span>
        <span>
          {t('s09Estimates.columns.total')}:{' '}
          <strong>{formatMoney(Money.parse(estimate.total))}</strong>
        </span>
        {estimate.status === 'accepted' || estimate.status === 'converted' ? (
          <span>{t('s09Estimates.decision.accepted', { name: estimate.signerName })}</span>
        ) : null}
        {estimate.convertedInvoiceId ? (
          <Link className="underline" href={`/invoices/${estimate.convertedInvoiceId}`}>
            {t('s09Estimates.messages.converted')}
          </Link>
        ) : null}
      </div>
      <EstimateActions
        id={estimate.id}
        status={estimate.status}
        trashed={trashed}
        canUpdate={canUpdate}
        canSend={canSend}
        canConvertRight={canConvertRight}
        canDelete={canDelete}
        isOwner={actor.role === 'owner'}
      />
      <InvoiceForm
        invoice={{ id: estimate.id, version: estimate.version, status: estimate.status }}
        target={TARGET}
        readOnly={!editable}
        initial={estimate.input}
        rates={data.rates}
        fxRates={data.fxRates}
        defaultTaxCodes={data.defaultTaxCodes}
        clientName={estimate.clientName}
      />
      <section className="space-y-sp-8 text-sm">
        <h2 className="text-lg font-semibold">{t('s09Estimates.timeline')}</h2>
        {events.length === 0 ? (
          <p className="text-muted-foreground">{t('s09Estimates.noEvents')}</p>
        ) : (
          <ul className="space-y-sp-4">
            {events.map((e) => (
              <li key={e.id}>
                <time dateTime={e.createdAt} className="text-muted-foreground">
                  {e.createdAt.slice(0, 16).replace('T', ' ')}
                </time>{' '}
                {e.message}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
