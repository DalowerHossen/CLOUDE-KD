// path: app/(admin)/admin/users/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { userListQuery } from '@/lib/company/admin-input';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listUsers, type UserRow } from '@/services/company/admin';
import { Pager } from '../_components/pager';
import { SearchForm } from '../_components/search-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Users' };

const p = (k: string): string => t(`s07Company.adminPeople.${k}` as never);
const columns: readonly DataColumn<UserRow>[] = [
  { key: 'name', header: p('name'), primary: true, cell: (r) => r.name || r.email },
  { key: 'email', header: p('email'), cell: (r) => r.email },
  { key: 'role', header: p('role'), cell: (r) => r.role },
  { key: 'company', header: p('company'), hideOnMobile: true, cell: (r) => r.companyName || '-' },
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
      <Link className="underline" href={`/admin/users/${r.userId}`}>
        {p('open')}
      </Link>
    ),
  },
];

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  await requirePagePermission('people.read', 'platform', 'user');
  const raw = await searchParams;
  const flat = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  const parsed = userListQuery.safeParse(flat);
  const query = parsed.success ? parsed.data : userListQuery.parse({});
  let result: Awaited<ReturnType<typeof listUsers>> | null;
  try {
    result = await listUsers(query);
  } catch {
    result = null;
  }
  return (
    <div className="space-y-sp-16">
      <PageHeader title={p('usersTitle')} description={p('usersDescription')} />
      <SearchForm
        action="/admin/users"
        q={query.q ?? ''}
        placeholder={p('searchPlaceholder')}
        filters={[
          {
            name: 'role',
            value: query.role ?? '',
            allLabel: p('allRoles'),
            options: [
              { value: 'owner', label: 'Owner' },
              { value: 'staff', label: 'Staff' },
              { value: 'platform', label: 'Platform staff' },
            ],
          },
          {
            name: 'status',
            value: query.status ?? '',
            allLabel: p('allStatuses'),
            options: [
              { value: 'active', label: 'Active' },
              { value: 'disabled', label: 'Disabled' },
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
            getRowId={(r) => r.userId}
            caption={p('usersTitle')}
            empty={<EmptyState title={p('empty')} />}
          />
          <Pager
            base="/admin/users"
            params={{ q: query.q, role: query.role, status: query.status }}
            page={query.page}
            total={result.total}
          />
        </>
      )}
    </div>
  );
}
