// path: app/(dashboard)/inventory/documents/new/page.tsx
import type { Metadata } from 'next';
import { DocumentForm } from '@/components/inventory/document-form';
import { PageHeader } from '@/components/shared/page-header';
import { DOCUMENT_KINDS, type DocumentKind } from '@/lib/stock/documents';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { ensureDefaultWarehouse, listWarehouses } from '@/services/inventory/warehouses';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'New stock document' };

export default async function NewDocumentPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('inventory.documents', 'tenant', 'inventory_document');
  const companyId = actor.companyId as string;
  await ensureDefaultWarehouse(companyId);
  const warehouses = await listWarehouses(companyId);
  const kindParam = (await searchParams).kind;
  const kind: DocumentKind = DOCUMENT_KINDS.find((k) => k === kindParam) ?? 'receipt';
  return (
    <div className="mx-auto max-w-4xl space-y-sp-16">
      <PageHeader title={t('s08Crm.documents.createTitle')} />
      <DocumentForm doc={null} kind={kind} warehouses={warehouses} />
    </div>
  );
}
