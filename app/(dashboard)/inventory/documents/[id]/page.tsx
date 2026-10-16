// path: app/(dashboard)/inventory/documents/[id]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PrintButton } from '@/components/crm/print-button';
import { DocumentForm } from '@/components/inventory/document-form';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { getService } from '@/lib/container';
import { NotFoundError } from '@/lib/errors';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { getDocument, type DocumentView } from '@/services/inventory/documents';
import { listWarehouses } from '@/services/inventory/warehouses';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Stock document' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const trim = (v: string): string => v.replace(/0+$/, '').replace(/\.$/, '');

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('inventory.read', 'tenant', 'inventory_document');
  const id = (await params).id;
  if (!UUID.test(id)) notFound();
  const companyId = actor.companyId as string;
  let doc: DocumentView;
  try {
    doc = await getDocument(companyId, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const canEdit = await getService('permissions').can(actor, 'inventory.documents', {
    type: 'inventory_document',
  });
  const warehouses = await listWarehouses(companyId);
  const kindLabel = t(`s08Crm.documents.kinds.${doc.kind}` as StringKey);
  return (
    <div className="mx-auto max-w-4xl space-y-sp-16 print:max-w-none">
      <PageHeader
        title={t('s08Crm.documents.detailTitle', { kind: kindLabel, number: doc.number })}
        actions={
          <Link className="underline print:hidden" href="/inventory/documents">
            {t('s08Crm.documents.back')}
          </Link>
        }
      />
      <div className="flex flex-wrap items-center gap-sp-8 print:hidden">
        <Badge variant="outline">{t(`s08Crm.documents.statuses.${doc.status}` as StringKey)}</Badge>
        <PrintButton label={t('s08Crm.documents.print')} />
      </div>
      {doc.status === 'draft' && canEdit ? (
        <DocumentForm doc={doc} kind={doc.kind} warehouses={warehouses} />
      ) : (
        <section className="space-y-sp-12 text-sm">
          <dl className="grid gap-sp-8 sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">{t('s08Crm.documents.warehouse')}</dt>
              <dd>{doc.warehouseName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('s08Crm.documents.party')}</dt>
              <dd>{doc.partyName || '-'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('s08Crm.documents.reference')}</dt>
              <dd>{doc.reference || '-'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('s08Crm.documents.date')}</dt>
              <dd>{(doc.postedAt ?? doc.createdAt).slice(0, 10)}</dd>
            </div>
          </dl>
          {doc.note ? <p className="whitespace-pre-wrap">{doc.note}</p> : null}
          <table className="w-full">
            <thead>
              <tr className="text-left">
                <th>{t('s08Crm.documents.item')}</th>
                <th>{t('s08Crm.products.sku')}</th>
                <th className="text-right">{t('s08Crm.documents.quantity')}</th>
                <th>{t('s08Crm.documents.batch')}</th>
                <th>{t('s08Crm.documents.expiry')}</th>
              </tr>
            </thead>
            <tbody>
              {doc.lines.map((l) => (
                <tr key={l.position} className="border-t">
                  <td className="py-1">
                    {l.productName}
                    {l.variantName ? ` - ${l.variantName}` : ''}
                  </td>
                  <td>{l.sku ?? '-'}</td>
                  <td className="text-right">{trim(l.quantity)}</td>
                  <td>{l.batchNo ?? '-'}</td>
                  <td>{l.expiresOn ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {doc.kind === 'delivery_note' || doc.kind === 'packing_slip' ? (
            <p className="pt-sp-24">{t('s08Crm.documents.signature')}: ______________________</p>
          ) : null}
          {doc.status === 'posted' ? (
            <p className="text-muted-foreground print:hidden">{t('s08Crm.documents.postedNote')}</p>
          ) : null}
        </section>
      )}
    </div>
  );
}
