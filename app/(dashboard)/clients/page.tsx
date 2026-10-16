// path: app/(dashboard)/clients/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { countryName } from '@/lib/company/countries';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { recentClients, type ClientView } from '@/services/client/clients';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Clients' };

const columns: readonly DataColumn<ClientView>[] = [
  { key: 'name', header: t('s08Crm.clients.name'), primary: true, cell: (r) => r.name },
  { key: 'email', header: t('s08Crm.clients.email'), cell: (r) => r.email ?? '-' },
  {
    key: 'phone',
    header: t('s08Crm.clients.phone'),
    hideOnMobile: true,
    cell: (r) => r.phone || '-',
  },
  {
    key: 'country',
    header: t('s08Crm.clients.country'),
    hideOnMobile: true,
    cell: (r) => (r.billing.country ? countryName(r.billing.country) : '-'),
  },
  {
    key: 'tags',
    header: t('s08Crm.clients.tags'),
    hideOnMobile: true,
    cell: (r) =>
      r.tags.map((x) => (
        <Badge key={x} variant="outline" className="mr-1">
          {x}
        </Badge>
      )),
  },
  {
    key: 'open',
    header: '',
    cell: (r) => (
      <Link className="underline" href={`/clients/${r.id}`}>
        {t('s08Crm.clients.open')}
      </Link>
    ),
  },
];

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('client.read', 'tenant', 'client');
  const view = (await searchParams).view === 'archived' ? 'archived' : 'active';
  let rows: ClientView[] | null;
  try {
    rows = await recentClients(actor.companyId as string, view);
  } catch {
    rows = null;
  }
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s08Crm.clients.title')}
        description={t('s08Crm.clients.description')}
        actions={
          <Link className="underline" href="/clients/new">
            {t('s08Crm.clients.newClient')}
          </Link>
        }
      />
      <nav className="flex gap-sp-12 text-sm" aria-label={t('s08Crm.clients.title')}>
        <Link
          className={view === 'active' ? 'font-semibold underline' : 'underline'}
          href="/clients"
        >
          {t('s08Crm.clients.viewActive')}
        </Link>
        <Link
          className={view === 'archived' ? 'font-semibold underline' : 'underline'}
          href="/clients?view=archived"
        >
          {t('s08Crm.clients.viewArchived')}
        </Link>
      </nav>
      {rows === null ? (
        <ErrorState description={t('s08Crm.clients.loadError')} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          caption={t('s08Crm.clients.title')}
          empty={
            <EmptyState
              title={
                view === 'active' ? t('s08Crm.clients.empty') : t('s08Crm.clients.emptyArchived')
              }
            />
          }
        />
      )}
    </div>
  );
}
