// path: app/(dashboard)/inventory/counts/[id]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CountSheet } from '@/components/inventory/count-sheet';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { getService } from '@/lib/container';
import { NotFoundError } from '@/lib/errors';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { getCount, type CountView } from '@/services/inventory/counts';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Stock count' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('inventory.read', 'tenant', 'stock_count');
  const id = (await params).id;
  if (!UUID.test(id)) notFound();
  let count: CountView;
  try {
    count = await getCount(actor.companyId as string, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const canEdit = await getService('permissions').can(actor, 'inventory.count', {
    type: 'stock_count',
  });
  return (
    <div className="mx-auto max-w-4xl space-y-sp-16">
      <PageHeader
        title={t('s08Crm.counts.detailTitle', { number: count.number })}
        description={count.warehouseName}
        actions={
          <Link className="underline" href="/inventory/counts">
            {t('s08Crm.counts.back')}
          </Link>
        }
      />
      <Badge variant="outline">{t(`s08Crm.counts.statuses.${count.status}` as StringKey)}</Badge>
      <CountSheet count={count} canEdit={canEdit} />
    </div>
  );
}
