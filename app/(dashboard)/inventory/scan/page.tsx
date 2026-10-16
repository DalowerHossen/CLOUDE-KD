// path: app/(dashboard)/inventory/scan/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { ScanPanel } from '@/components/inventory/scan-panel';
import { PageHeader } from '@/components/shared/page-header';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Scan a barcode' };

export default async function ScanPage(): Promise<JSX.Element> {
  await requirePagePermission('inventory.read', 'tenant', 'stock');
  return (
    <div className="mx-auto max-w-xl space-y-sp-16">
      <PageHeader
        title={t('s08Crm.scan.title')}
        description={t('s08Crm.scan.description')}
        actions={
          <Link className="underline" href="/inventory">
            {t('s08Crm.inventory.title')}
          </Link>
        }
      />
      <ScanPanel />
    </div>
  );
}
