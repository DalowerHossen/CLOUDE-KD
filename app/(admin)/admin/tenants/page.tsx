// path: app/(admin)/admin/tenants/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { tenantListQuery } from '@/lib/company/admin-input';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listTenants, type TenantRow } from '@/services/company/admin';
import { Pager } from '../_components/pager';
import { SearchForm } from '../_components/search-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Companies' };

const p = (k: string): string => t(`s07Company.adminPeople.${k}` as never);
const columns: readonly DataColumn<TenantRow>[] = [
  { key: 'name', header: p('name'), primary: true, cell: (r) => r.name },
  { key: 'slug', header: p('company'), hideOnMobile: true, cell: (r) => r.slug },
  { key: 'plan', header: p('plan'), cell: (r) => r.plan },
  { key: 'country', header: p('country'), hideOnMobile: true, cell: (r) => r.country ?? '-' },
  {
    key: 'status',
    header: p('status'),
    cell: (r) => <Badge variant="outline">{r.status}</Badge>,
  },
  { key: 'joined', header: p('joined'), hideOnMobile: true, cell: (r) => r.createdAt.slice(0, 10) },
  {
    key: 'open',
    header: '',
    cell: (r) => (
      <Link className="underline" href={`/admin/tenants/${r.id}`}>
        {p('open')}
      </Link>
    ),
  },
];

export default async function TenantsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  await requirePagePermission('people.read', 'platform', 'tenant');
  const raw = await searchParams;
  const flat = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  const parsed = tenantListQuery.safeParse(flat);
  const query = parsed.success ? parsed.data : tenantListQuery.parse({});
  let result: Awaited<ReturnType<typeof listTenants>> | null;
  try {
    result = await listTenants(query);
  } catch {
    result = null;
  }
  return (
    <div className="space-y-sp-16">
      <PageHeader title={p('tenantsTitle')} description={p('tenantsDescription')} />
      <SearchForm
        action="/admin/tenants"
        q={query.q ?? ''}
        placeholder={p('searchTenantPlaceholder')}
        filters={[
          {
            name: 'status',
            value: query.status ?? '',
            allLabel: p('allStatuses'),
            options: [
              { value: 'active', label: 'Active' },
              { value: 'suspended', label: 'Suspended' },
              { value: 'closed', label: 'Closed' },
            ],
          },
        ]}
      />
      {result === null ? (
        <ErrorState description={p('loadError')} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={result.rows}
            getRowId={(r) => r.id}
            caption={p('tenantsTitle')}
            empty={<EmptyState title={p('empty')} />}
          />
          <Pager
            base="/admin/tenants"
            params={{ q: query.q, status: query.status }}
            page={query.page}
            total={result.total}
          />
        </>
      )}
    </div>
  );
}
