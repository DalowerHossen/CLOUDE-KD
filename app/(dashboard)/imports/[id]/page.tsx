// path: app/(dashboard)/imports/[id]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ImportWizard } from '@/components/transfer/import-wizard';
import { PageHeader } from '@/components/shared/page-header';
import { NotFoundError } from '@/lib/errors';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { getImport, type ImportDetail } from '@/services/import/imports';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Import' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ImportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('import.manage', 'tenant', 'import_job');
  const id = (await params).id;
  if (!UUID.test(id)) notFound();
  let detail: ImportDetail;
  try {
    detail = await getImport(actor.companyId as string, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  return (
    <div className="mx-auto max-w-4xl space-y-sp-16">
      <PageHeader
        title={t('s08Crm.transfer.detailTitle', { name: detail.fileName })}
        actions={
          <Link className="underline" href="/imports">
            {t('s08Crm.transfer.back')}
          </Link>
        }
      />
      <ImportWizard detail={detail} />
    </div>
  );
}
