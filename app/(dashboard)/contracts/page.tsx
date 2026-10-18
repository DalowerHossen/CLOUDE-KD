// path: app/(dashboard)/contracts/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listContracts, type ContractListItem } from '@/services/contract/contracts';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Contracts' };

const columns: readonly DataColumn<ContractListItem>[] = [
  {
    key: 'title',
    header: t('s13Portal.contracts.columns.title'),
    primary: true,
    cell: (r) => (
      <Link className="underline" href={`/contracts/${r.id}`}>
        {r.number} {r.title}
      </Link>
    ),
  },
  { key: 'client', header: t('s13Portal.contracts.columns.client'), cell: (r) => r.clientName },
  {
    key: 'status',
    header: t('s13Portal.contracts.columns.status'),
    cell: (r) => (
      <Badge variant="outline">{t(`s13Portal.contracts.statuses.${r.status}` as StringKey)}</Badge>
    ),
  },
  {
    key: 'signed',
    header: t('s13Portal.contracts.columns.signed'),
    hideOnMobile: true,
    cell: (r) => `${r.signersSigned} / ${r.signersTotal}`,
  },
  {
    key: 'ends',
    header: t('s13Portal.contracts.columns.ends'),
    hideOnMobile: true,
    cell: (r) => r.endsOn ?? '-',
  },
];

export default async function ContractsPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('contract.read', 'tenant', 'contract');
  let rows: ContractListItem[] | null;
  try {
    rows = await listContracts(actor.companyId as string, { limit: 100 });
  } catch {
    rows = null;
  }
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s13Portal.contracts.pageTitle')}
        description={t('s13Portal.contracts.pageDescription')}
        actions={
          <Button asChild>
            <Link href="/contracts/new">{t('s13Portal.contracts.new')}</Link>
          </Button>
        }
      />
      {rows === null ? (
        <ErrorState description={t('s13Portal.contracts.loadError')} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          caption={t('s13Portal.contracts.pageTitle')}
          empty={<EmptyState title={t('s13Portal.contracts.empty')} />}
        />
      )}
    </div>
  );
}
